//! # npm_package_lock
//!
//! @title   NPMPackageLock — Vulnerability audit module for package-lock.json entries.
//!
//! @notice  Audits `package-lock.json` dependency entries for known security
//!          vulnerabilities, version constraint violations, and integrity hash validity.
//!
//!          Introduced to address **GHSA-xpqw-6gx7-v673** — a high-severity
//!          Denial-of-Service vulnerability in `svgo` versions `>=3.0.0 <3.3.3`
//!          caused by unconstrained XML entity expansion (Billion Laughs attack).
//!
//! ## Security Assumptions
//!
//! 1. `sha512` integrity hashes are the only accepted algorithm; `sha1` and
//!    `sha256` are rejected as insufficient.
//! 2. `lockfileVersion` must be 2 or 3 (npm >=7). Version 1 lacks integrity
//!    hashes for all entries and is considered insecure.
//! 3. The advisory map (`min_safe_versions`) must be kept up to date as new
//!    CVEs are published. This module does not perform live advisory lookups.
//! 4. This module audits resolved versions only. Ranges in `package.json`
//!    should be reviewed separately to prevent future resolution of vulnerable
//!    versions.

#![allow(dead_code)]

use soroban_sdk::{String, Vec};

// ── Constants ────────────────────────────────────────────────────────────────

/// Minimum lockfile version that includes integrity hashes for all entries.
const MIN_LOCKFILE_VERSION: u32 = 2;

/// Maximum lockfile version currently supported.
const MAX_LOCKFILE_VERSION: u32 = 3;

/// Minimum safe version for svgo (fixes GHSA-xpqw-6gx7-v673).
const SVGO_MIN_SAFE_VERSION: &str = "3.3.3";

// ── Data Types ───────────────────────────────────────────────────────────────

/// Represents a single entry in a package-lock.json file.
///
/// @dev    Mirrors the structure of npm's lockfile format (v2/v3).
#[derive(Clone)]
pub struct PackageEntry {
    /// Package name (e.g., "svgo", "react").
    pub name: String,
    /// Resolved semantic version (e.g., "3.3.3").
    pub version: String,
    /// Integrity hash (e.g., "sha512-...").
    pub integrity: String,
    /// Whether this is a dev dependency.
    pub dev: bool,
}

/// Result of auditing a single package entry.
///
/// @dev    Contains the package name, pass/fail status, and a list of issues found.
#[derive(Clone)]
pub struct AuditResult {
    /// Package name.
    pub package_name: String,
    /// Whether the audit passed.
    pub passed: bool,
    /// List of issues found (empty if passed).
    pub issues: Vec<String>,
}

// ── Semver Parsing ───────────────────────────────────────────────────────────

/// @notice Parse a semantic version string into (major, minor, patch) tuple.
///
/// @dev    Handles optional "v" prefix, pre-release suffixes, and missing patch.
///         Returns (0, 0, 0) on parse failure to allow graceful degradation.
///
/// # Arguments
/// * `version` – A semver string (e.g., "3.3.3", "v1.2.0", "1.2.0-alpha").
///
/// # Returns
/// A tuple `(major, minor, patch)` or `(0, 0, 0)` on parse failure.
pub fn parse_semver(version: &String) -> (u32, u32, u32) {
    let v_str = version.to_xdr().to_string();
    let trimmed = v_str.trim_start_matches('v');

    // Split on pre-release marker (-, +)
    let base_version = trimmed.split('-').next().unwrap_or(trimmed);
    let base_version = base_version.split('+').next().unwrap_or(base_version);

    let parts: Vec<&str> = base_version.split('.').collect();

    let major = parts
        .get(0)
        .and_then(|p| p.parse::<u32>().ok())
        .unwrap_or(0);
    let minor = parts
        .get(1)
        .and_then(|p| p.parse::<u32>().ok())
        .unwrap_or(0);
    let patch = parts
        .get(2)
        .and_then(|p| p.parse::<u32>().ok())
        .unwrap_or(0);

    (major, minor, patch)
}

/// @notice Check if `version >= min_version` using semantic versioning rules.
///
/// @dev    Compares major, then minor, then patch in order.
///
/// # Arguments
/// * `version`     – The version to check.
/// * `min_version` – The minimum acceptable version.
///
/// # Returns
/// `true` if `version >= min_version`, `false` otherwise.
pub fn is_version_gte(version: &String, min_version: &String) -> bool {
    let (v_major, v_minor, v_patch) = parse_semver(version);
    let (m_major, m_minor, m_patch) = parse_semver(min_version);

    if v_major != m_major {
        return v_major > m_major;
    }
    if v_minor != m_minor {
        return v_minor > m_minor;
    }
    v_patch >= m_patch
}

// ── Integrity Validation ─────────────────────────────────────────────────────

/// @notice Validate that an integrity hash is present and uses sha512.
///
/// @dev    Rejects sha1 and sha256 as insufficient. Requires "sha512-" prefix.
///
/// # Arguments
/// * `integrity` – The integrity hash string (e.g., "sha512-...").
///
/// # Returns
/// `true` if valid sha512 hash, `false` otherwise.
pub fn validate_integrity(integrity: &String) -> bool {
    let hash_str = integrity.to_xdr().to_string();
    !hash_str.is_empty() && hash_str.starts_with("sha512-")
}

// ── Package Auditing ─────────────────────────────────────────────────────────

/// @notice Audit a single package entry against known vulnerabilities.
///
/// @dev    Checks version constraints and integrity hash validity.
///         Returns a typed `AuditResult` with pass/fail status and issues.
///
/// # Arguments
/// * `entry`                – The package entry to audit.
/// * `min_safe_versions`    – Map of package names to minimum safe versions.
///
/// # Returns
/// An `AuditResult` with `passed=true` if all checks pass, `false` otherwise.
pub fn audit_package(
    entry: &PackageEntry,
    min_safe_versions: &soroban_sdk::Map<String, String>,
) -> AuditResult {
    let mut issues = Vec::new();

    // Check integrity hash
    if !validate_integrity(&entry.integrity) {
        issues.push_back(String::from_slice(
            &soroban_sdk::Env::default(),
            "Invalid or missing sha512 integrity hash",
        ));
    }

    // Check version against advisory
    if let Some(min_safe) = min_safe_versions.get(entry.name.clone()) {
        if !is_version_gte(&entry.version, &min_safe) {
            let msg = format!(
                "Version {} is below minimum safe version {}",
                entry.version.to_xdr().to_string(),
                min_safe.to_xdr().to_string()
            );
            issues.push_back(String::from_slice(&soroban_sdk::Env::default(), &msg));
        }
    }

    let passed = issues.is_empty();

    AuditResult {
        package_name: entry.name.clone(),
        passed,
        issues,
    }
}

/// @notice Audit all packages in a lockfile snapshot.
///
/// @dev    Iterates over all entries and collects results.
///
/// # Arguments
/// * `packages`             – Vector of package entries to audit.
/// * `min_safe_versions`    – Map of package names to minimum safe versions.
///
/// # Returns
/// A vector of `AuditResult` for each package.
pub fn audit_all(
    packages: &Vec<PackageEntry>,
    min_safe_versions: &soroban_sdk::Map<String, String>,
) -> Vec<AuditResult> {
    let env = soroban_sdk::Env::default();
    let mut results = Vec::new(&env);

    for i in 0..packages.len() {
        if let Some(entry) = packages.get(i) {
            let result = audit_package(&entry, min_safe_versions);
            results.push_back(result);
        }
    }

    results
}

/// @notice Filter audit results to only those that failed.
///
/// @dev    Returns a new vector containing only failed results.
///
/// # Arguments
/// * `results` – Vector of audit results.
///
/// # Returns
/// A vector containing only results where `passed=false`.
pub fn failing_results(results: &Vec<AuditResult>) -> Vec<AuditResult> {
    let env = soroban_sdk::Env::default();
    let mut failures = Vec::new(&env);

    for i in 0..results.len() {
        if let Some(result) = results.get(i) {
            if !result.passed {
                failures.push_back(result);
            }
        }
    }

    failures
}

/// @notice Validate the lockfile version.
///
/// @dev    Only versions 2 and 3 (npm >=7) are accepted.
///         Version 1 lacks integrity hashes and is considered insecure.
///
/// # Arguments
/// * `version` – The lockfile version number.
///
/// # Returns
/// `true` if version is 2 or 3, `false` otherwise.
pub fn validate_lockfile_version(version: u32) -> bool {
    version >= MIN_LOCKFILE_VERSION && version <= MAX_LOCKFILE_VERSION
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/// @notice Check if any audit results failed.
///
/// @dev    Convenience function for quick validation.
///
/// # Arguments
/// * `results` – Vector of audit results.
///
/// # Returns
/// `true` if any result failed, `false` if all passed.
pub fn has_failures(results: &Vec<AuditResult>) -> bool {
    for i in 0..results.len() {
        if let Some(result) = results.get(i) {
            if !result.passed {
                return true;
            }
        }
    }
    false
}

/// @notice Count the number of failed audits.
///
/// @dev    Useful for reporting and metrics.
///
/// # Arguments
/// * `results` – Vector of audit results.
///
/// # Returns
/// The count of failed audits.
pub fn count_failures(results: &Vec<AuditResult>) -> u32 {
    let mut count = 0u32;
    for i in 0..results.len() {
        if let Some(result) = results.get(i) {
            if !result.passed {
                count += 1;
            }
        }
    }
    count
}
