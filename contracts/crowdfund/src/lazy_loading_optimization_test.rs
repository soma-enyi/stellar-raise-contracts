//! Comprehensive tests for the lazy_loading_optimization module.
//!
//! Covers:
//! - `LazyField::new()` / `is_loaded()` initial state
//! - `get_or_default_instance` caching behaviour
//! - `lazy_goal`, `lazy_total_raised`, `lazy_deadline`, `lazy_min_contribution`
//! - `CampaignSnapshot::load` and derived helpers
//! - `progress_bps` boundary values (0%, 50%, 100%, overflow)
//! - `goal_met` and `is_expired` logic
//! - Edge cases: zero goal, zero total_raised, deadline at current timestamp

#![cfg(test)]

use soroban_sdk::{testutils::Ledger, Env};

use crate::{
    lazy_loading_optimization::{
        lazy_deadline, lazy_goal, lazy_min_contribution, lazy_total_raised, CampaignSnapshot,
        LazyField,
    },
    DataKey,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Seeds the minimum set of instance-storage keys needed by the snapshot helpers.
fn seed_campaign(env: &Env, goal: i128, total_raised: i128, deadline: u64, min_contribution: i128) {
    env.storage().instance().set(&DataKey::Goal, &goal);
    env.storage()
        .instance()
        .set(&DataKey::TotalRaised, &total_raised);
    env.storage().instance().set(&DataKey::Deadline, &deadline);
    env.storage()
        .instance()
        .set(&DataKey::MinContribution, &min_contribution);
}

// ---------------------------------------------------------------------------
// LazyField — unit tests
// ---------------------------------------------------------------------------

#[test]
fn lazy_field_starts_unloaded() {
    let field: LazyField<i128> = LazyField::new();
    assert!(!field.is_loaded());
}

#[test]
fn lazy_field_default_is_unloaded() {
    let field: LazyField<i128> = LazyField::default();
    assert!(!field.is_loaded());
}

#[test]
fn lazy_field_is_loaded_after_first_access() {
    let env = Env::default();
    env.storage().instance().set(&DataKey::Goal, &500i128);

    let mut field: LazyField<i128> = LazyField::new();
    assert!(!field.is_loaded());

    let _ = field.get_or_default_instance(&env, &DataKey::Goal, 0i128);
    assert!(field.is_loaded());
}

#[test]
fn lazy_field_returns_stored_value() {
    let env = Env::default();
    env.storage().instance().set(&DataKey::Goal, &1_000i128);

    let mut field: LazyField<i128> = LazyField::new();
    let value = field.get_or_default_instance(&env, &DataKey::Goal, 0i128);
    assert_eq!(value, 1_000i128);
}

#[test]
fn lazy_field_returns_default_when_key_absent() {
    let env = Env::default();
    // Do NOT seed DataKey::Goal
    let mut field: LazyField<i128> = LazyField::new();
    let value = field.get_or_default_instance(&env, &DataKey::Goal, 42i128);
    assert_eq!(value, 42i128);
}

#[test]
fn lazy_field_caches_value_on_second_call() {
    let env = Env::default();
    env.storage().instance().set(&DataKey::Goal, &999i128);

    let mut field: LazyField<i128> = LazyField::new();
    let first = field.get_or_default_instance(&env, &DataKey::Goal, 0i128);

    // Overwrite storage — cached value should still be returned
    env.storage().instance().set(&DataKey::Goal, &1i128);
    let second = field.get_or_default_instance(&env, &DataKey::Goal, 0i128);

    assert_eq!(first, 999i128);
    assert_eq!(second, 999i128); // cached, not re-read
}

// ---------------------------------------------------------------------------
// Lazy view helpers
// ---------------------------------------------------------------------------

#[test]
fn lazy_goal_returns_seeded_value() {
    let env = Env::default();
    env.storage().instance().set(&DataKey::Goal, &5_000i128);

    let mut cache: LazyField<i128> = LazyField::new();
    assert_eq!(lazy_goal(&env, &mut cache), 5_000i128);
}

#[test]
fn lazy_goal_returns_zero_when_absent() {
    let env = Env::default();
    let mut cache: LazyField<i128> = LazyField::new();
    assert_eq!(lazy_goal(&env, &mut cache), 0i128);
}

#[test]
fn lazy_total_raised_returns_seeded_value() {
    let env = Env::default();
    env.storage()
        .instance()
        .set(&DataKey::TotalRaised, &250i128);

    let mut cache: LazyField<i128> = LazyField::new();
    assert_eq!(lazy_total_raised(&env, &mut cache), 250i128);
}

#[test]
fn lazy_total_raised_returns_zero_when_absent() {
    let env = Env::default();
    let mut cache: LazyField<i128> = LazyField::new();
    assert_eq!(lazy_total_raised(&env, &mut cache), 0i128);
}

#[test]
fn lazy_deadline_returns_seeded_value() {
    let env = Env::default();
    env.storage().instance().set(&DataKey::Deadline, &9_999u64);

    let mut cache: LazyField<u64> = LazyField::new();
    assert_eq!(lazy_deadline(&env, &mut cache), 9_999u64);
}

#[test]
fn lazy_deadline_returns_zero_when_absent() {
    let env = Env::default();
    let mut cache: LazyField<u64> = LazyField::new();
    assert_eq!(lazy_deadline(&env, &mut cache), 0u64);
}

#[test]
fn lazy_min_contribution_returns_seeded_value() {
    let env = Env::default();
    env.storage()
        .instance()
        .set(&DataKey::MinContribution, &10i128);

    let mut cache: LazyField<i128> = LazyField::new();
    assert_eq!(lazy_min_contribution(&env, &mut cache), 10i128);
}

#[test]
fn lazy_min_contribution_returns_zero_when_absent() {
    let env = Env::default();
    let mut cache: LazyField<i128> = LazyField::new();
    assert_eq!(lazy_min_contribution(&env, &mut cache), 0i128);
}

// ---------------------------------------------------------------------------
// CampaignSnapshot::load
// ---------------------------------------------------------------------------

#[test]
fn snapshot_load_populates_all_fields() {
    let env = Env::default();
    seed_campaign(&env, 1_000, 400, 9_000, 5);

    let snap = CampaignSnapshot::load(&env);
    assert_eq!(snap.goal, 1_000);
    assert_eq!(snap.total_raised, 400);
    assert_eq!(snap.deadline, 9_000);
    assert_eq!(snap.min_contribution, 5);
}

#[test]
fn snapshot_total_raised_defaults_to_zero_when_absent() {
    let env = Env::default();
    // Seed everything except TotalRaised
    env.storage().instance().set(&DataKey::Goal, &1_000i128);
    env.storage().instance().set(&DataKey::Deadline, &9_000u64);
    env.storage()
        .instance()
        .set(&DataKey::MinContribution, &1i128);

    let snap = CampaignSnapshot::load(&env);
    assert_eq!(snap.total_raised, 0);
}

// ---------------------------------------------------------------------------
// CampaignSnapshot::progress_bps
// ---------------------------------------------------------------------------

#[test]
fn progress_bps_zero_when_nothing_raised() {
    let snap = CampaignSnapshot {
        goal: 1_000,
        total_raised: 0,
        deadline: 9_999,
        min_contribution: 1,
    };
    assert_eq!(snap.progress_bps(), 0);
}

#[test]
fn progress_bps_5000_at_half_goal() {
    let snap = CampaignSnapshot {
        goal: 1_000,
        total_raised: 500,
        deadline: 9_999,
        min_contribution: 1,
    };
    assert_eq!(snap.progress_bps(), 5_000);
}

#[test]
fn progress_bps_10000_at_full_goal() {
    let snap = CampaignSnapshot {
        goal: 1_000,
        total_raised: 1_000,
        deadline: 9_999,
        min_contribution: 1,
    };
    assert_eq!(snap.progress_bps(), 10_000);
}

#[test]
fn progress_bps_saturates_at_10000_when_exceeded() {
    let snap = CampaignSnapshot {
        goal: 1_000,
        total_raised: 2_000,
        deadline: 9_999,
        min_contribution: 1,
    };
    assert_eq!(snap.progress_bps(), 10_000);
}

#[test]
fn progress_bps_zero_when_goal_is_zero() {
    let snap = CampaignSnapshot {
        goal: 0,
        total_raised: 500,
        deadline: 9_999,
        min_contribution: 1,
    };
    assert_eq!(snap.progress_bps(), 0);
}

#[test]
fn progress_bps_zero_when_goal_is_negative() {
    let snap = CampaignSnapshot {
        goal: -1,
        total_raised: 500,
        deadline: 9_999,
        min_contribution: 1,
    };
    assert_eq!(snap.progress_bps(), 0);
}

// ---------------------------------------------------------------------------
// CampaignSnapshot::goal_met
// ---------------------------------------------------------------------------

#[test]
fn goal_met_false_when_below_goal() {
    let snap = CampaignSnapshot {
        goal: 1_000,
        total_raised: 999,
        deadline: 9_999,
        min_contribution: 1,
    };
    assert!(!snap.goal_met());
}

#[test]
fn goal_met_true_when_exactly_at_goal() {
    let snap = CampaignSnapshot {
        goal: 1_000,
        total_raised: 1_000,
        deadline: 9_999,
        min_contribution: 1,
    };
    assert!(snap.goal_met());
}

#[test]
fn goal_met_true_when_above_goal() {
    let snap = CampaignSnapshot {
        goal: 1_000,
        total_raised: 1_500,
        deadline: 9_999,
        min_contribution: 1,
    };
    assert!(snap.goal_met());
}

// ---------------------------------------------------------------------------
// CampaignSnapshot::is_expired
// ---------------------------------------------------------------------------

#[test]
fn is_expired_false_before_deadline() {
    let env = Env::default();
    env.ledger().set_timestamp(100);

    let snap = CampaignSnapshot {
        goal: 1_000,
        total_raised: 0,
        deadline: 200,
        min_contribution: 1,
    };
    assert!(!snap.is_expired(&env));
}

#[test]
fn is_expired_false_at_exact_deadline() {
    let env = Env::default();
    env.ledger().set_timestamp(200);

    let snap = CampaignSnapshot {
        goal: 1_000,
        total_raised: 0,
        deadline: 200,
        min_contribution: 1,
    };
    // timestamp == deadline → NOT expired (strict greater-than)
    assert!(!snap.is_expired(&env));
}

#[test]
fn is_expired_true_after_deadline() {
    let env = Env::default();
    env.ledger().set_timestamp(201);

    let snap = CampaignSnapshot {
        goal: 1_000,
        total_raised: 0,
        deadline: 200,
        min_contribution: 1,
    };
    assert!(snap.is_expired(&env));
}

#[test]
fn is_expired_true_when_deadline_is_zero() {
    let env = Env::default();
    env.ledger().set_timestamp(1);

    let snap = CampaignSnapshot {
        goal: 1_000,
        total_raised: 0,
        deadline: 0,
        min_contribution: 1,
    };
    assert!(snap.is_expired(&env));
}
