//! Tests for `contract_state_size` — state-size limit enforcement.
//!
//! Coverage targets (≥ 95 %):
//! - Every `check_*` helper returns `Ok` when below the limit.
//! - Every `check_*` helper returns the correct `Err` variant exactly at the limit.
//! - `check_string_len` accepts strings at the boundary and rejects strings one byte over.
//! - Constants are set to their documented values.

#![cfg(test)]

use soroban_sdk::{contract, contractimpl, testutils::Address as _, Address, Env, String, Vec};

use crate::{
    contract_state_size::{
        check_contributor_limit, check_pledger_limit, check_roadmap_limit,
        check_stretch_goal_limit, check_string_len, StateSizeError, MAX_CONTRIBUTORS,
        MAX_ROADMAP_ITEMS, MAX_STRETCH_GOALS, MAX_STRING_LEN,
    },
    DataKey, RoadmapItem,
};

// ── Minimal contract needed to access storage in tests ───────────────────────

#[contract]
struct TestContract;

#[contractimpl]
impl TestContract {}

// ── helpers ───────────────────────────────────────────────────────────────────

fn make_env() -> (Env, soroban_sdk::Address) {
    let env = Env::default();
    let contract_id = env.register(TestContract, ());
    (env, contract_id)
}

/// Build a `soroban_sdk::String` of exactly `n` bytes (ASCII 'a').
/// `n` must be ≤ 512.
fn str_of_len(env: &Env, n: u32) -> String {
    assert!(n <= 512, "str_of_len: n too large for test helper");
    let mut b = soroban_sdk::Bytes::new(env);
    for _ in 0..n {
        b.push_back(b'a');
    }
    let mut buf = [0u8; 512];
    b.copy_into_slice(&mut buf[..n as usize]);
    String::from_bytes(env, &buf[..n as usize])
}

// ── constant sanity checks ────────────────────────────────────────────────────

#[test]
fn constants_have_expected_values() {
    assert_eq!(MAX_CONTRIBUTORS, 128);
    assert_eq!(MAX_ROADMAP_ITEMS, 32);
    assert_eq!(MAX_STRETCH_GOALS, 32);
    assert_eq!(MAX_STRING_LEN, 256);
}

// ── error discriminants ───────────────────────────────────────────────────────

#[test]
fn error_discriminants_are_stable() {
    assert_eq!(StateSizeError::ContributorLimitExceeded as u32, 100);
    assert_eq!(StateSizeError::RoadmapLimitExceeded as u32, 101);
    assert_eq!(StateSizeError::StretchGoalLimitExceeded as u32, 102);
    assert_eq!(StateSizeError::StringTooLong as u32, 103);
}

// ── check_string_len ─────────────────────────────────────────────────────────

#[test]
fn string_len_empty_is_ok() {
    let (env, _) = make_env();
    let s = String::from_str(&env, "");
    assert_eq!(check_string_len(&s), Ok(()));
}

#[test]
fn string_len_at_limit_is_ok() {
    let (env, _) = make_env();
    let s = str_of_len(&env, MAX_STRING_LEN);
    assert_eq!(check_string_len(&s), Ok(()));
}

#[test]
fn string_len_one_over_limit_is_err() {
    let (env, _) = make_env();
    let s = str_of_len(&env, MAX_STRING_LEN + 1);
    assert_eq!(check_string_len(&s), Err(StateSizeError::StringTooLong));
}

#[test]
fn string_len_well_over_limit_is_err() {
    let (env, _) = make_env();
    let s = str_of_len(&env, MAX_STRING_LEN + 100);
    assert_eq!(check_string_len(&s), Err(StateSizeError::StringTooLong));
}

// ── check_contributor_limit ───────────────────────────────────────────────────

#[test]
fn contributor_limit_empty_list_is_ok() {
    let (env, contract_id) = make_env();
    env.as_contract(&contract_id, || {
        assert_eq!(check_contributor_limit(&env), Ok(()));
    });
}

#[test]
fn contributor_limit_below_max_is_ok() {
    let (env, contract_id) = make_env();
    env.as_contract(&contract_id, || {
        let mut list: Vec<Address> = Vec::new(&env);
        for _ in 0..MAX_CONTRIBUTORS - 1 {
            list.push_back(Address::generate(&env));
        }
        env.storage()
            .persistent()
            .set(&DataKey::Contributors, &list);
        assert_eq!(check_contributor_limit(&env), Ok(()));
    });
}

#[test]
fn contributor_limit_at_max_is_err() {
    let (env, contract_id) = make_env();
    env.as_contract(&contract_id, || {
        let mut list: Vec<Address> = Vec::new(&env);
        for _ in 0..MAX_CONTRIBUTORS {
            list.push_back(Address::generate(&env));
        }
        env.storage()
            .persistent()
            .set(&DataKey::Contributors, &list);
        assert_eq!(
            check_contributor_limit(&env),
            Err(StateSizeError::ContributorLimitExceeded)
        );
    });
}

#[test]
fn contributor_limit_over_max_is_err() {
    let (env, contract_id) = make_env();
    env.as_contract(&contract_id, || {
        let mut list: Vec<Address> = Vec::new(&env);
        for _ in 0..MAX_CONTRIBUTORS + 5 {
            list.push_back(Address::generate(&env));
        }
        env.storage()
            .persistent()
            .set(&DataKey::Contributors, &list);
        assert_eq!(
            check_contributor_limit(&env),
            Err(StateSizeError::ContributorLimitExceeded)
        );
    });
}

// ── check_pledger_limit ───────────────────────────────────────────────────────

#[test]
fn pledger_limit_empty_list_is_ok() {
    let (env, contract_id) = make_env();
    env.as_contract(&contract_id, || {
        assert_eq!(check_pledger_limit(&env), Ok(()));
    });
}

#[test]
fn pledger_limit_below_max_is_ok() {
    let (env, contract_id) = make_env();
    env.as_contract(&contract_id, || {
        let mut list: Vec<Address> = Vec::new(&env);
        for _ in 0..MAX_CONTRIBUTORS - 1 {
            list.push_back(Address::generate(&env));
        }
        env.storage().persistent().set(&DataKey::Pledgers, &list);
        assert_eq!(check_pledger_limit(&env), Ok(()));
    });
}

#[test]
fn pledger_limit_at_max_is_err() {
    let (env, contract_id) = make_env();
    env.as_contract(&contract_id, || {
        let mut list: Vec<Address> = Vec::new(&env);
        for _ in 0..MAX_CONTRIBUTORS {
            list.push_back(Address::generate(&env));
        }
        env.storage().persistent().set(&DataKey::Pledgers, &list);
        assert_eq!(
            check_pledger_limit(&env),
            Err(StateSizeError::ContributorLimitExceeded)
        );
    });
}

// ── check_roadmap_limit ───────────────────────────────────────────────────────

#[test]
fn roadmap_limit_empty_list_is_ok() {
    let (env, contract_id) = make_env();
    env.as_contract(&contract_id, || {
        assert_eq!(check_roadmap_limit(&env), Ok(()));
    });
}

#[test]
fn roadmap_limit_below_max_is_ok() {
    let (env, contract_id) = make_env();
    env.as_contract(&contract_id, || {
        let mut list: Vec<RoadmapItem> = Vec::new(&env);
        for i in 0..MAX_ROADMAP_ITEMS - 1 {
            list.push_back(RoadmapItem {
                date: 1_000_000 + i as u64,
                description: String::from_str(&env, "milestone"),
            });
        }
        env.storage().instance().set(&DataKey::Roadmap, &list);
        assert_eq!(check_roadmap_limit(&env), Ok(()));
    });
}

#[test]
fn roadmap_limit_at_max_is_err() {
    let (env, contract_id) = make_env();
    env.as_contract(&contract_id, || {
        let mut list: Vec<RoadmapItem> = Vec::new(&env);
        for i in 0..MAX_ROADMAP_ITEMS {
            list.push_back(RoadmapItem {
                date: 1_000_000 + i as u64,
                description: String::from_str(&env, "milestone"),
            });
        }
        env.storage().instance().set(&DataKey::Roadmap, &list);
        assert_eq!(
            check_roadmap_limit(&env),
            Err(StateSizeError::RoadmapLimitExceeded)
        );
    });
}

// ── check_stretch_goal_limit ──────────────────────────────────────────────────

#[test]
fn stretch_goal_limit_empty_list_is_ok() {
    let (env, contract_id) = make_env();
    env.as_contract(&contract_id, || {
        assert_eq!(check_stretch_goal_limit(&env), Ok(()));
    });
}

#[test]
fn stretch_goal_limit_below_max_is_ok() {
    let (env, contract_id) = make_env();
    env.as_contract(&contract_id, || {
        let mut list: Vec<i128> = Vec::new(&env);
        for i in 0..MAX_STRETCH_GOALS - 1 {
            list.push_back(1_000 * (i as i128 + 1));
        }
        env.storage().instance().set(&DataKey::StretchGoals, &list);
        assert_eq!(check_stretch_goal_limit(&env), Ok(()));
    });
}

#[test]
fn stretch_goal_limit_at_max_is_err() {
    let (env, contract_id) = make_env();
    env.as_contract(&contract_id, || {
        let mut list: Vec<i128> = Vec::new(&env);
        for i in 0..MAX_STRETCH_GOALS {
            list.push_back(1_000 * (i as i128 + 1));
        }
        env.storage().instance().set(&DataKey::StretchGoals, &list);
        assert_eq!(
            check_stretch_goal_limit(&env),
            Err(StateSizeError::StretchGoalLimitExceeded)
        );
    });
}
