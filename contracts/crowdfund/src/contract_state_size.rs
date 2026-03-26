//! Contract State Size Limits
//!
//! This contract defines and exposes the maximum size limits for all campaign-related data
//! stored in the Stellar Raise platform's on-chain state. These limits ensure:
//!
//! - **Resource Efficiency**: Prevents ledger state bloat by capping entry sizes.
//! - **Frontend Reliability**: The UI can validate inputs locally against these known limits.
//! - **Predictable Fees**: State-rent (storage) costs remain within predictable bounds.
//!
//! All constants are measured in bytes (for strings) or item counts (for vectors).

// contract_state_size — State size limits for the crowdfund contract.

use soroban_sdk::{contract, contractimpl, Env, String};

// ── State Limits ─────────────────────────────────────────────────────────────

/// Maximum campaign title length in bytes.
pub const MAX_TITLE_LENGTH: u32 = 128;

/// Maximum campaign description length in bytes.
pub const MAX_DESCRIPTION_LENGTH: u32 = 2_048;

/// Maximum social-links string length in bytes.
pub const MAX_SOCIAL_LINKS_LENGTH: u32 = 512;

/// Maximum number of unique contributors tracked per campaign.
pub const MAX_CONTRIBUTORS: u32 = 1_000;

/// Maximum number of roadmap items stored for a campaign.
pub const MAX_ROADMAP_ITEMS: u32 = 32;

/// Maximum number of stretch goals (milestones).
pub const MAX_STRETCH_GOALS: u32 = 32;

/// Minimum allowed campaign goal in token units.
pub const MIN_GOAL_AMOUNT: i128 = 100;

#[contract]
pub struct ContractStateSize;

#[contractimpl]
impl ContractStateSize {
    /// Returns the maximum allowed title length in bytes.
    /// @dev Used by frontend UI to set input field `maxlength`.
    pub fn max_title_length(_env: Env) -> u32 {
        MAX_TITLE_LENGTH
    }

    /// Returns the maximum allowed description length in bytes.
    pub fn max_description_length(_env: Env) -> u32 {
        MAX_DESCRIPTION_LENGTH
    }

    /// Returns the maximum allowed social links length in bytes.
    pub fn max_social_links_length(_env: Env) -> u32 {
        MAX_SOCIAL_LINKS_LENGTH
    }

    /// Returns the maximum number of contributors per campaign.
    pub fn max_contributors(_env: Env) -> u32 {
        MAX_CONTRIBUTORS
    }

    /// Returns the maximum number of roadmap items.
    pub fn max_roadmap_items(_env: Env) -> u32 {
        MAX_ROADMAP_ITEMS
    }

    /// Returns the maximum number of stretch goals.
    pub fn max_stretch_goals(_env: Env) -> u32 {
        MAX_STRETCH_GOALS
    }

    /// Validates that a string does not exceed the platform's title limit.
    /// @param title The campaign title to validate.
    /// @return `true` if length <= MAX_TITLE_LENGTH.
    pub fn validate_title(_env: Env, title: String) -> bool {
        title.len() <= MAX_TITLE_LENGTH
    }

    /// Validates that a description does not exceed the platform limit.
    /// @param description The campaign description to validate.
    /// @return `true` if length <= MAX_DESCRIPTION_LENGTH.
    pub fn validate_description(_env: Env, description: String) -> bool {
        description.len() <= MAX_DESCRIPTION_LENGTH
    }

    /// Validates that an aggregate metadata length is within bounds.
    /// @param total_len The combined length of all metadata strings.
    /// @return `true` if within safe limits to prevent state-rent spikes.
    pub fn validate_metadata_aggregate(_env: Env, total_len: u32) -> bool {
        const AGGREGATE_LIMIT: u32 =
            MAX_TITLE_LENGTH + MAX_DESCRIPTION_LENGTH + MAX_SOCIAL_LINKS_LENGTH;
        total_len <= AGGREGATE_LIMIT
    }
}

// ── Standalone helpers (called from lib.rs) ───────────────────────────────────

/// Returns `Ok(())` if `count < MAX_CONTRIBUTORS`, else `Err("limit exceeded")`.
#[inline]
pub fn validate_contributor_capacity(count: u32) -> Result<(), &'static str> {
    if count >= MAX_CONTRIBUTORS {
        Err("contributor limit exceeded")
    } else {
        Ok(())
    }
}

/// Panics if the contributor list is at capacity.
#[inline]
pub fn check_contributor_limit(env: &soroban_sdk::Env) -> Result<(), &'static str> {
    use soroban_sdk::Vec;
    let count: u32 = env
        .storage()
        .persistent()
        .get::<_, Vec<soroban_sdk::Address>>(&crate::DataKey::Contributors)
        .map(|v| v.len())
        .unwrap_or(0);
    validate_contributor_capacity(count)
}

/// Returns `Ok(())` if `count < MAX_CONTRIBUTORS`, else `Err("limit exceeded")`.
#[inline]
pub fn validate_pledger_capacity(count: u32) -> Result<(), &'static str> {
    if count >= MAX_CONTRIBUTORS {
        Err("pledger limit exceeded")
    } else {
        Ok(())
    }
}

/// Panics if the pledger list is at capacity.
#[inline]
pub fn check_pledger_limit(env: &soroban_sdk::Env) -> Result<(), &'static str> {
    use soroban_sdk::Vec;
    let count: u32 = env
        .storage()
        .persistent()
        .get::<_, Vec<soroban_sdk::Address>>(&crate::DataKey::Pledgers)
        .map(|v| v.len())
        .unwrap_or(0);
    validate_pledger_capacity(count)
}

/// Validates total metadata length.
#[inline]
pub fn validate_metadata_total_length(total_len: u32) -> Result<(), &'static str> {
    const AGGREGATE_LIMIT: u32 =
        MAX_TITLE_LENGTH + MAX_DESCRIPTION_LENGTH + MAX_SOCIAL_LINKS_LENGTH;
    if total_len > AGGREGATE_LIMIT {
        Err("metadata too long")
    } else {
        Ok(())
    }
}

/// Validates a title string length.
#[inline]
pub fn validate_title(title: &soroban_sdk::String) -> Result<(), &'static str> {
    if title.len() > MAX_TITLE_LENGTH {
        Err("title too long")
    } else {
        Ok(())
    }
}

/// Validates a description string length.
#[inline]
pub fn validate_description(desc: &soroban_sdk::String) -> Result<(), &'static str> {
    if desc.len() > MAX_DESCRIPTION_LENGTH {
        Err("description too long")
    } else {
        Ok(())
    }
}

/// Validates social links string length.
#[inline]
pub fn validate_social_links(links: &soroban_sdk::String) -> Result<(), &'static str> {
    if links.len() > MAX_SOCIAL_LINKS_LENGTH {
        Err("social links too long")
    } else {
        Ok(())
    }
}

/// Validates a generic string length (uses description limit).
#[inline]
pub fn check_string_len(s: &soroban_sdk::String) -> Result<(), &'static str> {
    validate_description(s)
}

/// Validates roadmap item capacity.
#[inline]
pub fn validate_roadmap_capacity(count: u32) -> Result<(), &'static str> {
    if count >= MAX_ROADMAP_ITEMS {
        Err("roadmap limit exceeded")
    } else {
        Ok(())
    }
}

/// Checks roadmap limit from storage.
#[inline]
pub fn check_roadmap_limit(env: &soroban_sdk::Env) -> Result<(), &'static str> {
    use soroban_sdk::Vec;
    let count: u32 = env
        .storage()
        .persistent()
        .get::<_, Vec<crate::RoadmapItem>>(&crate::DataKey::Roadmap)
        .map(|v| v.len())
        .unwrap_or(0);
    validate_roadmap_capacity(count)
}

/// Validates a roadmap item description length.
#[inline]
pub fn validate_roadmap_description(desc: &soroban_sdk::String) -> Result<(), &'static str> {
    validate_description(desc)
}

/// Validates stretch goal capacity.
#[inline]
pub fn validate_stretch_goal_capacity(count: u32) -> Result<(), &'static str> {
    if count >= MAX_STRETCH_GOALS {
        Err("stretch goal limit exceeded")
    } else {
        Ok(())
    }
}

/// Checks stretch goal limit from storage.
#[inline]
pub fn check_stretch_goal_limit(env: &soroban_sdk::Env) -> Result<(), &'static str> {
    use soroban_sdk::Vec;
    let count: u32 = env
        .storage()
        .persistent()
        .get::<_, Vec<i128>>(&crate::DataKey::StretchGoals)
        .map(|v| v.len())
        .unwrap_or(0);
    validate_stretch_goal_capacity(count)
}
