//! Maintainable validation/storage helpers for `initialize()`.
//!
//! This module extracts the initialization logic from `lib.rs` so the security
//! checks are easier to review and unit test.

use soroban_sdk::{Address, Env, String, Vec};

use crate::{contract_state_size, DataKey, PlatformConfig, RoadmapItem, Status};

/// @notice Validates initialization inputs and panics on invalid configuration.
/// @dev Panics preserve existing contract behavior for callers that rely on
///      fail-fast initialization checks.
pub fn validate_initialize_inputs(
    goal: i128,
    min_contribution: i128,
    platform_config: &Option<PlatformConfig>,
    bonus_goal: Option<i128>,
    bonus_goal_description: &Option<String>,
) {
    if goal <= 0 {
        panic!("goal must be positive");
    }
    if min_contribution <= 0 {
        panic!("min contribution must be positive");
    }

    if let Some(config) = platform_config {
        if config.fee_bps > 10_000 {
            panic!("platform fee cannot exceed 100%");
        }
    }

    if let Some(bg) = bonus_goal {
        if bg <= goal {
            panic!("bonus goal must be greater than primary goal");
        }
    }

    if let Some(description) = bonus_goal_description {
        if let Err(err) = contract_state_size::validate_bonus_goal_description(description) {
            panic!("{}", err);
        }
    }
}

/// @notice Persists initialize() state in one place for easier audits.
pub fn persist_initialize_state(
    env: &Env,
    admin: &Address,
    creator: &Address,
    token: &Address,
    goal: i128,
    deadline: u64,
    min_contribution: i128,
    platform_config: &Option<PlatformConfig>,
    bonus_goal: Option<i128>,
    bonus_goal_description: &Option<String>,
) {
    env.storage().instance().set(&DataKey::Admin, admin);
    env.storage().instance().set(&DataKey::Creator, creator);
    env.storage().instance().set(&DataKey::Token, token);
    env.storage().instance().set(&DataKey::Goal, &goal);
    env.storage().instance().set(&DataKey::Deadline, &deadline);
    env.storage()
        .instance()
        .set(&DataKey::MinContribution, &min_contribution);
    env.storage().instance().set(&DataKey::TotalRaised, &0i128);
    env.storage()
        .instance()
        .set(&DataKey::BonusGoalReachedEmitted, &false);
    env.storage().instance().set(&DataKey::Status, &Status::Active);

    if let Some(config) = platform_config {
        env.storage().instance().set(&DataKey::PlatformConfig, config);
    }
    if let Some(bg) = bonus_goal {
        env.storage().instance().set(&DataKey::BonusGoal, &bg);
    }
    if let Some(description) = bonus_goal_description {
        env.storage()
            .instance()
            .set(&DataKey::BonusGoalDescription, description);
    }

    let empty_contributors: Vec<Address> = Vec::new(env);
    env.storage()
        .persistent()
        .set(&DataKey::Contributors, &empty_contributors);

    let empty_roadmap: Vec<RoadmapItem> = Vec::new(env);
    env.storage().instance().set(&DataKey::Roadmap, &empty_roadmap);
}
