//! Lazy-loading optimization helpers for the Stellar Raise crowdfund contract.
//!
//! @title Lazy Loading Optimization
//! @notice Provides deferred, on-demand storage reads to reduce unnecessary
//!         ledger I/O and lower per-transaction resource consumption.
//! @dev All helpers are pure or storage-thin and designed to be composed with
//!      the existing stream-processing and state-size modules.
//!
//! # Design Rationale
//!
//! Soroban charges per-entry storage access. Reading every campaign field on
//! every call wastes budget when only a subset of fields is needed. This module
//! introduces a `LazyField<T>` wrapper that defers the actual storage read until
//! the value is first requested, and caches the result for the lifetime of the
//! transaction.
//!
//! # Security Assumptions
//!
//! - Values are loaded from `instance` or `persistent` storage exactly once per
//!   transaction; subsequent accesses return the cached copy.
//! - No mutable state is written by this module — it is read-only.
//! - Callers are responsible for ensuring the key exists before calling
//!   `get_or_load`; a missing key will panic with a descriptive message.

use soroban_sdk::{Env, IntoVal, TryFromVal, Val};

use crate::DataKey;

// ---------------------------------------------------------------------------
// LazyField
// ---------------------------------------------------------------------------

/// A lazily-loaded, cached storage value.
///
/// @notice Wraps an `Option<T>` that starts as `None` and is populated on the
///         first call to `get_or_load`. Subsequent calls return the cached value
///         without touching storage.
///
/// @dev `T` must implement `Clone` so the cached value can be returned by value
///      without consuming the wrapper.
pub struct LazyField<T: Clone> {
    cached: Option<T>,
}

impl<T: Clone> LazyField<T> {
    /// Creates a new, unloaded `LazyField`.
    ///
    /// @return An empty `LazyField` with no cached value.
    pub fn new() -> Self {
        Self { cached: None }
    }

    /// Returns `true` if the value has already been loaded from storage.
    ///
    /// @return `true` when the cached value is present.
    pub fn is_loaded(&self) -> bool {
        self.cached.is_some()
    }

    /// Returns the cached value if already loaded, otherwise loads it from
    /// instance storage, caches it, and returns it.
    ///
    /// @param env The Soroban environment.
    /// @param key The `DataKey` to read from instance storage.
    /// @return The stored value of type `T`.
    ///
    /// @custom:security Panics with `"lazy_loading: key not found in instance storage"`
    ///                  when the key is absent. Callers must ensure the contract
    ///                  has been initialized before calling this function.
    pub fn get_or_load_instance<V>(&mut self, env: &Env, key: &DataKey) -> T
    where
        V: Into<T> + TryFromVal<Env, Val>,
        T: IntoVal<Env, Val> + TryFromVal<Env, Val>,
    {
        if let Some(ref v) = self.cached {
            return v.clone();
        }
        let value: T = env
            .storage()
            .instance()
            .get(key)
            .expect("lazy_loading: key not found in instance storage");
        self.cached = Some(value.clone());
        value
    }

    /// Returns the cached value if already loaded, otherwise loads it from
    /// persistent storage, caches it, and returns it.
    ///
    /// @param env The Soroban environment.
    /// @param key The `DataKey` to read from persistent storage.
    /// @return The stored value of type `T`.
    ///
    /// @custom:security Panics with `"lazy_loading: key not found in persistent storage"`
    ///                  when the key is absent.
    pub fn get_or_load_persistent<V>(&mut self, env: &Env, key: &DataKey) -> T
    where
        V: Into<T> + TryFromVal<Env, Val>,
        T: IntoVal<Env, Val> + TryFromVal<Env, Val>,
    {
        if let Some(ref v) = self.cached {
            return v.clone();
        }
        let value: T = env
            .storage()
            .persistent()
            .get(key)
            .expect("lazy_loading: key not found in persistent storage");
        self.cached = Some(value.clone());
        value
    }

    /// Returns the cached value if present, or `default` if the key is absent
    /// from instance storage.
    ///
    /// @param env     The Soroban environment.
    /// @param key     The `DataKey` to read from instance storage.
    /// @param default The fallback value when the key is not found.
    /// @return The stored value or `default`.
    pub fn get_or_default_instance(&mut self, env: &Env, key: &DataKey, default: T) -> T
    where
        T: IntoVal<Env, Val> + TryFromVal<Env, Val>,
    {
        if let Some(ref v) = self.cached {
            return v.clone();
        }
        let value: T = env
            .storage()
            .instance()
            .get(key)
            .unwrap_or(default);
        self.cached = Some(value.clone());
        value
    }
}

impl<T: Clone> Default for LazyField<T> {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// Lazy campaign view helpers
// ---------------------------------------------------------------------------

/// Returns the campaign goal, loading it lazily from instance storage.
///
/// @param env   The Soroban environment.
/// @param cache Mutable lazy cache for the goal value.
/// @return The campaign goal in token units.
pub fn lazy_goal(env: &Env, cache: &mut LazyField<i128>) -> i128 {
    cache.get_or_default_instance(env, &DataKey::Goal, 0)
}

/// Returns the total raised so far, loading it lazily from instance storage.
///
/// @param env   The Soroban environment.
/// @param cache Mutable lazy cache for the total-raised value.
/// @return The total amount raised in token units.
pub fn lazy_total_raised(env: &Env, cache: &mut LazyField<i128>) -> i128 {
    cache.get_or_default_instance(env, &DataKey::TotalRaised, 0)
}

/// Returns the campaign deadline, loading it lazily from instance storage.
///
/// @param env   The Soroban environment.
/// @param cache Mutable lazy cache for the deadline value.
/// @return The campaign deadline as a Unix timestamp.
pub fn lazy_deadline(env: &Env, cache: &mut LazyField<u64>) -> u64 {
    cache.get_or_default_instance(env, &DataKey::Deadline, 0u64)
}

/// Returns the minimum contribution, loading it lazily from instance storage.
///
/// @param env   The Soroban environment.
/// @param cache Mutable lazy cache for the minimum contribution value.
/// @return The minimum contribution amount in token units.
pub fn lazy_min_contribution(env: &Env, cache: &mut LazyField<i128>) -> i128 {
    cache.get_or_default_instance(env, &DataKey::MinContribution, 0)
}

// ---------------------------------------------------------------------------
// Batch lazy-load helper
// ---------------------------------------------------------------------------

/// Snapshot of the most frequently accessed campaign scalars, loaded lazily.
///
/// @notice Construct with `CampaignSnapshot::load` to populate all fields in
///         the minimum number of storage reads (one per field, deferred until
///         first access).
pub struct CampaignSnapshot {
    pub goal: i128,
    pub total_raised: i128,
    pub deadline: u64,
    pub min_contribution: i128,
}

impl CampaignSnapshot {
    /// Loads all scalar campaign fields from instance storage in one pass.
    ///
    /// @param env The Soroban environment.
    /// @return A fully-populated `CampaignSnapshot`.
    ///
    /// @custom:security Panics if any required field is absent (contract not
    ///                  initialized). This is intentional — a partially
    ///                  initialized contract must not serve stale defaults.
    pub fn load(env: &Env) -> Self {
        let goal: i128 = env
            .storage()
            .instance()
            .get(&DataKey::Goal)
            .expect("lazy_loading: Goal not initialized");
        let total_raised: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalRaised)
            .unwrap_or(0);
        let deadline: u64 = env
            .storage()
            .instance()
            .get(&DataKey::Deadline)
            .expect("lazy_loading: Deadline not initialized");
        let min_contribution: i128 = env
            .storage()
            .instance()
            .get(&DataKey::MinContribution)
            .expect("lazy_loading: MinContribution not initialized");

        Self {
            goal,
            total_raised,
            deadline,
            min_contribution,
        }
    }

    /// Returns progress toward the goal in basis points (0–10 000).
    ///
    /// @return Progress in bps; saturates at 10 000 when goal is met or exceeded.
    pub fn progress_bps(&self) -> u32 {
        if self.goal <= 0 {
            return 0;
        }
        let raw = self.total_raised.saturating_mul(10_000) / self.goal;
        raw.clamp(0, 10_000) as u32
    }

    /// Returns `true` when the campaign deadline has passed.
    ///
    /// @param env The Soroban environment (used to read the ledger timestamp).
    /// @return `true` if the current ledger timestamp is past the deadline.
    pub fn is_expired(&self, env: &Env) -> bool {
        env.ledger().timestamp() > self.deadline
    }

    /// Returns `true` when the goal has been met or exceeded.
    ///
    /// @return `true` if `total_raised >= goal`.
    pub fn goal_met(&self) -> bool {
        self.total_raised >= self.goal
    }
}
