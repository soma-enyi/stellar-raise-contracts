//! Comprehensive test suite for npm_package_lock module.
//!
//! Coverage: 42 test cases covering all public functions with edge cases.
//! Target: ≥95% code coverage.

#[cfg(test)]
mod tests {
    use crate::npm_package_lock::*;
    use soroban_sdk::{Env, Map, String, Vec};

    // ── Helpers ──────────────────────────────────────────────────────────────

    fn create_entry(name: &str, version: &str, integrity: &str, dev: bool) -> PackageEntry {
        let env = Env::default();
        PackageEntry {
            name: String::from_slice(&env, name),
            version: String::from_slice(&env, version),
            integrity: String::from_slice(&env, integrity),
            dev,
        }
    }

    fn create_advisory_map(entries: Vec<(&str, &str)>) -> Map<String, String> {
        let env = Env::default();
        let mut map = Map::new(&env);
        for (pkg, min_version) in entries {
            map.set(
                String::from_slice(&env, pkg),
                String::from_slice(&env, min_version),
            );
        }
        map
    }

    // ── parse_semver Tests ───────────────────────────────────────────────────

    #[test]
    fn test_parse_semver_standard() {
        let env = Env::default();
        let version = String::from_slice(&env, "3.3.3");
        let (major, minor, patch) = parse_semver(&version);
        assert_eq!(major, 3);
        assert_eq!(minor, 3);
        assert_eq!(patch, 3);
    }

    #[test]
    fn test_parse_semver_with_v_prefix() {
        let env = Env::default();
        let version = String::from_slice(&env, "v1.2.0");
        let (major, minor, patch) = parse_semver(&version);
        assert_eq!(major, 1);
        assert_eq!(minor, 2);
        assert_eq!(patch, 0);
    }

    #[test]
    fn test_parse_semver_with_prerelease() {
        let env = Env::default();
        let version = String::from_slice(&env, "1.2.0-alpha");
        let (major, minor, patch) = parse_semver(&version);
        assert_eq!(major, 1);
        assert_eq!(minor, 2);
        assert_eq!(patch, 0);
    }

    #[test]
    fn test_parse_semver_with_build_metadata() {
        let env = Env::default();
        let version = String::from_slice(&env, "1.2.0+build.123");
        let (major, minor, patch) = parse_semver(&version);
        assert_eq!(major, 1);
        assert_eq!(minor, 2);
        assert_eq!(patch, 0);
    }

    #[test]
    fn test_parse_semver_missing_patch() {
        let env = Env::default();
        let version = String::from_slice(&env, "1.2");
        let (major, minor, patch) = parse_semver(&version);
        assert_eq!(major, 1);
        assert_eq!(minor, 2);
        assert_eq!(patch, 0);
    }

    #[test]
    fn test_parse_semver_zeros() {
        let env = Env::default();
        let version = String::from_slice(&env, "0.0.0");
        let (major, minor, patch) = parse_semver(&version);
        assert_eq!(major, 0);
        assert_eq!(minor, 0);
        assert_eq!(patch, 0);
    }

    #[test]
    fn test_parse_semver_large_numbers() {
        let env = Env::default();
        let version = String::from_slice(&env, "999.888.777");
        let (major, minor, patch) = parse_semver(&version);
        assert_eq!(major, 999);
        assert_eq!(minor, 888);
        assert_eq!(patch, 777);
    }

    #[test]
    fn test_parse_semver_non_numeric() {
        let env = Env::default();
        let version = String::from_slice(&env, "abc.def.ghi");
        let (major, minor, patch) = parse_semver(&version);
        assert_eq!(major, 0);
        assert_eq!(minor, 0);
        assert_eq!(patch, 0);
    }

    #[test]
    fn test_parse_semver_partial_numeric() {
        let env = Env::default();
        let version = String::from_slice(&env, "1.2.x");
        let (major, minor, patch) = parse_semver(&version);
        assert_eq!(major, 1);
        assert_eq!(minor, 2);
        assert_eq!(patch, 0);
    }

    // ── is_version_gte Tests ─────────────────────────────────────────────────

    #[test]
    fn test_is_version_gte_equal() {
        let env = Env::default();
        let v1 = String::from_slice(&env, "3.3.3");
        let v2 = String::from_slice(&env, "3.3.3");
        assert!(is_version_gte(&v1, &v2));
    }

    #[test]
    fn test_is_version_gte_greater_patch() {
        let env = Env::default();
        let v1 = String::from_slice(&env, "3.3.4");
        let v2 = String::from_slice(&env, "3.3.3");
        assert!(is_version_gte(&v1, &v2));
    }

    #[test]
    fn test_is_version_gte_greater_minor() {
        let env = Env::default();
        let v1 = String::from_slice(&env, "3.4.0");
        let v2 = String::from_slice(&env, "3.3.3");
        assert!(is_version_gte(&v1, &v2));
    }

    #[test]
    fn test_is_version_gte_greater_major() {
        let env = Env::default();
        let v1 = String::from_slice(&env, "4.0.0");
        let v2 = String::from_slice(&env, "3.3.3");
        assert!(is_version_gte(&v1, &v2));
    }

    #[test]
    fn test_is_version_gte_less_patch() {
        let env = Env::default();
        let v1 = String::from_slice(&env, "3.3.2");
        let v2 = String::from_slice(&env, "3.3.3");
        assert!(!is_version_gte(&v1, &v2));
    }

    #[test]
    fn test_is_version_gte_less_minor() {
        let env = Env::default();
        let v1 = String::from_slice(&env, "3.2.9");
        let v2 = String::from_slice(&env, "3.3.3");
        assert!(!is_version_gte(&v1, &v2));
    }

    #[test]
    fn test_is_version_gte_less_major() {
        let env = Env::default();
        let v1 = String::from_slice(&env, "2.9.9");
        let v2 = String::from_slice(&env, "3.3.3");
        assert!(!is_version_gte(&v1, &v2));
    }

    #[test]
    fn test_is_version_gte_with_prerelease() {
        let env = Env::default();
        let v1 = String::from_slice(&env, "3.3.3-beta");
        let v2 = String::from_slice(&env, "3.3.3");
        // Pre-release is stripped, so they compare equal
        assert!(is_version_gte(&v1, &v2));
    }

    // ── validate_integrity Tests ─────────────────────────────────────────────

    #[test]
    fn test_validate_integrity_valid_sha512() {
        let env = Env::default();
        let integrity = String::from_slice(&env, "sha512-abcdef1234567890");
        assert!(validate_integrity(&integrity));
    }

    #[test]
    fn test_validate_integrity_empty() {
        let env = Env::default();
        let integrity = String::from_slice(&env, "");
        assert!(!validate_integrity(&integrity));
    }

    #[test]
    fn test_validate_integrity_wrong_algorithm_sha256() {
        let env = Env::default();
        let integrity = String::from_slice(&env, "sha256-abcdef1234567890");
        assert!(!validate_integrity(&integrity));
    }

    #[test]
    fn test_validate_integrity_wrong_algorithm_sha1() {
        let env = Env::default();
        let integrity = String::from_slice(&env, "sha1-abcdef1234567890");
        assert!(!validate_integrity(&integrity));
    }

    #[test]
    fn test_validate_integrity_prefix_only() {
        let env = Env::default();
        let integrity = String::from_slice(&env, "sha512-");
        assert!(validate_integrity(&integrity));
    }

    // ── audit_package Tests ──────────────────────────────────────────────────

    #[test]
    fn test_audit_package_passes() {
        let env = Env::default();
        let entry = create_entry("svgo", "3.3.3", "sha512-abc123", false);
        let advisories = create_advisory_map(vec![("svgo", "3.3.3")]);

        let result = audit_package(&entry, &advisories);
        assert!(result.passed);
        assert_eq!(result.issues.len(), 0);
    }

    #[test]
    fn test_audit_package_fails_version_too_low() {
        let env = Env::default();
        let entry = create_entry("svgo", "3.3.2", "sha512-abc123", false);
        let advisories = create_advisory_map(vec![("svgo", "3.3.3")]);

        let result = audit_package(&entry, &advisories);
        assert!(!result.passed);
        assert!(result.issues.len() > 0);
    }

    #[test]
    fn test_audit_package_fails_invalid_integrity() {
        let env = Env::default();
        let entry = create_entry("svgo", "3.3.3", "sha256-abc123", false);
        let advisories = create_advisory_map(vec![("svgo", "3.3.3")]);

        let result = audit_package(&entry, &advisories);
        assert!(!result.passed);
        assert!(result.issues.len() > 0);
    }

    #[test]
    fn test_audit_package_fails_both_checks() {
        let env = Env::default();
        let entry = create_entry("svgo", "3.3.2", "sha256-abc123", false);
        let advisories = create_advisory_map(vec![("svgo", "3.3.3")]);

        let result = audit_package(&entry, &advisories);
        assert!(!result.passed);
        assert_eq!(result.issues.len(), 2);
    }

    #[test]
    fn test_audit_package_unknown_package() {
        let env = Env::default();
        let entry = create_entry("unknown-pkg", "1.0.0", "sha512-abc123", false);
        let advisories = create_advisory_map(vec![("svgo", "3.3.3")]);

        let result = audit_package(&entry, &advisories);
        assert!(result.passed);
    }

    #[test]
    fn test_audit_package_version_greater_than_min() {
        let env = Env::default();
        let entry = create_entry("svgo", "3.4.0", "sha512-abc123", false);
        let advisories = create_advisory_map(vec![("svgo", "3.3.3")]);

        let result = audit_package(&entry, &advisories);
        assert!(result.passed);
    }

    #[test]
    fn test_audit_package_dev_dependency() {
        let env = Env::default();
        let entry = create_entry("jest", "30.0.0", "sha512-abc123", true);
        let advisories = create_advisory_map(vec![("jest", "30.0.0")]);

        let result = audit_package(&entry, &advisories);
        assert!(result.passed);
    }

    #[test]
    fn test_audit_package_boundary_version_3_0_0() {
        let env = Env::default();
        let entry = create_entry("svgo", "3.0.0", "sha512-abc123", false);
        let advisories = create_advisory_map(vec![("svgo", "3.3.3")]);

        let result = audit_package(&entry, &advisories);
        assert!(!result.passed);
    }

    // ── audit_all Tests ──────────────────────────────────────────────────────

    #[test]
    fn test_audit_all_mixed_results() {
        let env = Env::default();
        let mut packages = Vec::new(&env);
        packages.push_back(create_entry("svgo", "3.3.3", "sha512-abc123", true));
        packages.push_back(create_entry("react", "19.0.0", "sha512-def456", false));
        packages.push_back(create_entry("jest", "30.0.0", "sha256-ghi789", false));

        let advisories = create_advisory_map(vec![
            ("svgo", "3.3.3"),
            ("react", "19.0.0"),
            ("jest", "30.0.0"),
        ]);

        let results = audit_all(&packages, &advisories);
        assert_eq!(results.len(), 3);
        assert!(results.get(0).unwrap().passed);
        assert!(results.get(1).unwrap().passed);
        assert!(!results.get(2).unwrap().passed);
    }

    #[test]
    fn test_audit_all_empty_input() {
        let env = Env::default();
        let packages = Vec::new(&env);
        let advisories = create_advisory_map(vec![]);

        let results = audit_all(&packages, &advisories);
        assert_eq!(results.len(), 0);
    }

    #[test]
    fn test_audit_all_all_pass() {
        let env = Env::default();
        let mut packages = Vec::new(&env);
        packages.push_back(create_entry("svgo", "3.3.3", "sha512-abc123", true));
        packages.push_back(create_entry("react", "19.0.0", "sha512-def456", false));

        let advisories = create_advisory_map(vec![("svgo", "3.3.3"), ("react", "19.0.0")]);

        let results = audit_all(&packages, &advisories);
        assert_eq!(results.len(), 2);
        for i in 0..results.len() {
            assert!(results.get(i).unwrap().passed);
        }
    }

    // ── failing_results Tests ────────────────────────────────────────────────

    #[test]
    fn test_failing_results_filters_correctly() {
        let env = Env::default();
        let mut results = Vec::new(&env);

        results.push_back(AuditResult {
            package_name: String::from_slice(&env, "pkg1"),
            passed: true,
            issues: Vec::new(&env),
        });

        results.push_back(AuditResult {
            package_name: String::from_slice(&env, "pkg2"),
            passed: false,
            issues: {
                let mut v = Vec::new(&env);
                v.push_back(String::from_slice(&env, "issue1"));
                v
            },
        });

        results.push_back(AuditResult {
            package_name: String::from_slice(&env, "pkg3"),
            passed: true,
            issues: Vec::new(&env),
        });

        let failures = failing_results(&results);
        assert_eq!(failures.len(), 1);
        assert_eq!(
            failures.get(0).unwrap().package_name.to_xdr().to_string(),
            "pkg2"
        );
    }

    #[test]
    fn test_failing_results_empty_when_all_pass() {
        let env = Env::default();
        let mut results = Vec::new(&env);

        results.push_back(AuditResult {
            package_name: String::from_slice(&env, "pkg1"),
            passed: true,
            issues: Vec::new(&env),
        });

        let failures = failing_results(&results);
        assert_eq!(failures.len(), 0);
    }

    // ── validate_lockfile_version Tests ──────────────────────────────────────

    #[test]
    fn test_validate_lockfile_version_2() {
        assert!(validate_lockfile_version(2));
    }

    #[test]
    fn test_validate_lockfile_version_3() {
        assert!(validate_lockfile_version(3));
    }

    #[test]
    fn test_validate_lockfile_version_1_rejected() {
        assert!(!validate_lockfile_version(1));
    }

    #[test]
    fn test_validate_lockfile_version_0_rejected() {
        assert!(!validate_lockfile_version(0));
    }

    #[test]
    fn test_validate_lockfile_version_4_rejected() {
        assert!(!validate_lockfile_version(4));
    }

    // ── has_failures Tests ───────────────────────────────────────────────────

    #[test]
    fn test_has_failures_true() {
        let env = Env::default();
        let mut results = Vec::new(&env);

        results.push_back(AuditResult {
            package_name: String::from_slice(&env, "pkg1"),
            passed: true,
            issues: Vec::new(&env),
        });

        results.push_back(AuditResult {
            package_name: String::from_slice(&env, "pkg2"),
            passed: false,
            issues: Vec::new(&env),
        });

        assert!(has_failures(&results));
    }

    #[test]
    fn test_has_failures_false() {
        let env = Env::default();
        let mut results = Vec::new(&env);

        results.push_back(AuditResult {
            package_name: String::from_slice(&env, "pkg1"),
            passed: true,
            issues: Vec::new(&env),
        });

        assert!(!has_failures(&results));
    }

    // ── count_failures Tests ─────────────────────────────────────────────────

    #[test]
    fn test_count_failures_multiple() {
        let env = Env::default();
        let mut results = Vec::new(&env);

        results.push_back(AuditResult {
            package_name: String::from_slice(&env, "pkg1"),
            passed: false,
            issues: Vec::new(&env),
        });

        results.push_back(AuditResult {
            package_name: String::from_slice(&env, "pkg2"),
            passed: true,
            issues: Vec::new(&env),
        });

        results.push_back(AuditResult {
            package_name: String::from_slice(&env, "pkg3"),
            passed: false,
            issues: Vec::new(&env),
        });

        assert_eq!(count_failures(&results), 2);
    }

    #[test]
    fn test_count_failures_zero() {
        let env = Env::default();
        let mut results = Vec::new(&env);

        results.push_back(AuditResult {
            package_name: String::from_slice(&env, "pkg1"),
            passed: true,
            issues: Vec::new(&env),
        });

        assert_eq!(count_failures(&results), 0);
    }
}
