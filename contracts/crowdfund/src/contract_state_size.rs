//! # Contract State Size Limits
//!
//! This module enforces upper-bound limits on the size of unbounded collections
//! stored in contract state to prevent:
//!
//! - **DoS via state bloat**: an attacker flooding the contributors or roadmap
//!   lists until operations become too expensive to execute.
//! - **Gas exhaustion**: iteration over an unbounded `Vec` in `withdraw`,
//!   `refund`, or `collect_pledges` can exceed Soroban resource limits.
//! - **Ledger entry size violations**: Soroban enforces a hard cap on the
//!   serialised size of each ledger entry; exceeding it causes a host panic.
//!
//! ## Security Assumptions
//!
//! 1. `MAX_CONTRIBUTORS` caps the `Contributors` and `Pledgers` persistent
//!    lists.  Any `contribute` or `pledge` call that would push the list past
//!    this limit is rejected with [`ContractError::StateSizeLimitExceeded`].
//! 2. `MAX_ROADMAP_ITEMS` caps the `Roadmap` instance list.
//! 3. `MAX_STRING_LEN` caps every user-supplied `String` field (title,
//!    description, social links, roadmap description) to prevent oversized
//!    ledger entries.
//! 4. `MAX_STRETCH_GOALS` caps the `StretchGoals` list.
//!
//! ## Limits (rationale)
//!
//! | Constant              | Value | Rationale                                      |
//! |-----------------------|-------|------------------------------------------------|
//! | `MAX_CONTRIBUTORS`    | 1 000 | Keeps `withdraw` / `refund` batch within gas   |
//! | `MAX_ROADMAP_ITEMS`   |    20 | Cosmetic list; no operational iteration needed |
//! | `MAX_STRETCH_GOALS`   |    10 | Small advisory list                            |
//! | `MAX_STRING_LEN`      |   256 | Prevents oversized instance-storage entries    |

#![allow(missing_docs)]

use soroban_sdk::{contracterror, Env, String, Vec};

use crate::DataKey;

// ── Limits ───────────────────────────────────────────────────────────────────

/// Maximum number of unique contributors tracked on-chain.
pub const MAX_CONTRIBUTORS: u32 = 128;

/// Maximum number of unique pledgers tracked on-chain.
pub const MAX_PLEDGERS: u32 = 128;

/// Maximum number of roadmap items stored in instance storage.
pub const MAX_ROADMAP_ITEMS: u32 = 32;

/// Maximum number of stretch-goal milestones.
pub const MAX_STRETCH_GOALS: u32 = 32;

/// Maximum campaign title length in bytes.
pub const MAX_TITLE_LENGTH: u32 = 128;
/// Maximum campaign description length in bytes.
pub const MAX_DESCRIPTION_LENGTH: u32 = 2_048;
/// Maximum social-links payload length in bytes.
pub const MAX_SOCIAL_LINKS_LENGTH: u32 = 512;
/// Maximum bonus-goal description length in bytes.
pub const MAX_BONUS_GOAL_DESCRIPTION_LENGTH: u32 = 280;
/// Maximum roadmap item description length in bytes.
pub const MAX_ROADMAP_DESCRIPTION_LENGTH: u32 = 280;
/// Maximum combined metadata budget (`title + description + socials`) in bytes.
pub const MAX_METADATA_TOTAL_LENGTH: u32 = 2_304;
/// Backward-compatible generic string limit used by legacy tests/helpers.
pub const MAX_STRING_LEN: u32 = 256;

// ── Error ─────────────────────────────────────────────────────────────────────

/// Returned when a state-size limit would be exceeded.
///
/// @notice Callers should treat this as a permanent rejection for the current
///         campaign state; the limit will not change without a contract upgrade.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum StateSizeError {
    /// The contributors / pledgers list is full.
    ContributorLimitExceeded = 100,
    /// The roadmap list is full.
    RoadmapLimitExceeded = 101,
    /// The stretch-goals list is full.
    StretchGoalLimitExceeded = 102,
    /// A string field exceeds `MAX_STRING_LEN` bytes.
    StringTooLong = 103,
}

impl core::fmt::Display for StateSizeError {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            StateSizeError::ContributorLimitExceeded => {
                f.write_str("contributor limit exceeded")
            }
            StateSizeError::RoadmapLimitExceeded => f.write_str("roadmap limit exceeded"),
            StateSizeError::StretchGoalLimitExceeded => {
                f.write_str("stretch goal limit exceeded")
            }
            StateSizeError::StringTooLong => f.write_str("string too long"),
        }
    }
}

// ── Validation helpers ────────────────────────────────────────────────────────

/// Validate title length.
pub fn validate_title(value: &String) -> Result<(), &'static str> {
    if value.len() > MAX_TITLE_LENGTH {
        return Err("title exceeds MAX_TITLE_LENGTH bytes".into());
    }
    Ok(())
}

/// Validate description length.
pub fn validate_description(value: &String) -> Result<(), &'static str> {
    if value.len() > MAX_DESCRIPTION_LENGTH {
        return Err("description exceeds MAX_DESCRIPTION_LENGTH bytes".into());
    }
    Ok(())
}

/// Validate social links length.
pub fn validate_social_links(value: &String) -> Result<(), &'static str> {
    if value.len() > MAX_SOCIAL_LINKS_LENGTH {
        return Err("social links exceed MAX_SOCIAL_LINKS_LENGTH bytes".into());
    }
    Ok(())
}

/// Validate bonus goal description length.
pub fn validate_bonus_goal_description(value: &String) -> Result<(), &'static str> {
    if value.len() > MAX_BONUS_GOAL_DESCRIPTION_LENGTH {
        return Err(
            "bonus goal description exceeds MAX_BONUS_GOAL_DESCRIPTION_LENGTH bytes".into(),
        );
    }
    Ok(())
}

/// Validate roadmap item description length.
pub fn validate_roadmap_description(value: &String) -> Result<(), &'static str> {
    if value.len() > MAX_ROADMAP_DESCRIPTION_LENGTH {
        return Err("roadmap description exceeds MAX_ROADMAP_DESCRIPTION_LENGTH bytes".into());
    }
    Ok(())
}

/// Validate metadata aggregate length.
pub fn validate_metadata_total_length(
    title_len: u32,
    description_len: u32,
    socials_len: u32,
) -> Result<(), &'static str> {
    let sum = title_len
        .checked_add(description_len)
        .and_then(|v| v.checked_add(socials_len))
        .ok_or("metadata exceeds MAX_METADATA_TOTAL_LENGTH bytes")?;
    if sum > MAX_METADATA_TOTAL_LENGTH {
        return Err("metadata exceeds MAX_METADATA_TOTAL_LENGTH bytes".into());
    }
    Ok(())
}

/// Validate contributor index capacity before append.
pub fn validate_contributor_capacity(len: u32) -> Result<(), &'static str> {
    if len >= MAX_CONTRIBUTORS {
        return Err("contributors exceed MAX_CONTRIBUTORS".into());
    }
    Ok(())
}

/// Validate pledger index capacity before append.
pub fn validate_pledger_capacity(len: u32) -> Result<(), &'static str> {
    if len >= MAX_PLEDGERS {
        return Err("pledgers exceed MAX_PLEDGERS".into());
    }
    Ok(())
}

/// Validate roadmap capacity before append.
pub fn validate_roadmap_capacity(len: u32) -> Result<(), &'static str> {
    if len >= MAX_ROADMAP_ITEMS {
        return Err("roadmap exceeds MAX_ROADMAP_ITEMS".into());
    }
    Ok(())
}

/// Validate stretch-goal capacity before append.
pub fn validate_stretch_goal_capacity(len: u32) -> Result<(), &'static str> {
    if len >= MAX_STRETCH_GOALS {
        return Err("stretch goals exceed MAX_STRETCH_GOALS".into());
    }
    Ok(())
}

/// Assert that `s` does not exceed [`MAX_STRING_LEN`] bytes.
///
/// @param s The string to validate.
/// @return `Ok(())` when within limits, `Err(StateSizeError::StringTooLong)` otherwise.
pub fn check_string_len(s: &String) -> Result<(), StateSizeError> {
    if s.len() > MAX_STRING_LEN {
        return Err(StateSizeError::StringTooLong);
    }
    Ok(())
}

/// Assert that adding one more entry to the `Contributors` list is allowed.
///
/// Reads the current list length from persistent storage and compares it
/// against [`MAX_CONTRIBUTORS`].
///
/// @param env Soroban environment reference.
/// @return `Ok(())` when within limits, `Err(StateSizeError::ContributorLimitExceeded)` otherwise.
pub fn check_contributor_limit(env: &Env) -> Result<(), StateSizeError> {
    let contributors: Vec<soroban_sdk::Address> = env
        .storage()
        .persistent()
        .get(&DataKey::Contributors)
        .unwrap_or_else(|| Vec::new(env));

    if contributors.len() >= MAX_CONTRIBUTORS {
        return Err(StateSizeError::ContributorLimitExceeded);
    }
    Ok(())
}

/// Assert that adding one more entry to the `Pledgers` list is allowed.
///
/// @param env Soroban environment reference.
/// @return `Ok(())` when within limits, `Err(StateSizeError::ContributorLimitExceeded)` otherwise.
pub fn check_pledger_limit(env: &Env) -> Result<(), StateSizeError> {
    let pledgers: Vec<soroban_sdk::Address> = env
        .storage()
        .persistent()
        .get(&DataKey::Pledgers)
        .unwrap_or_else(|| Vec::new(env));

    if pledgers.len() >= MAX_PLEDGERS {
        return Err(StateSizeError::ContributorLimitExceeded);
    }
    Ok(())
}

/// Assert that adding one more item to the `Roadmap` list is allowed.
///
/// @param env Soroban environment reference.
/// @return `Ok(())` when within limits, `Err(StateSizeError::RoadmapLimitExceeded)` otherwise.
pub fn check_roadmap_limit(env: &Env) -> Result<(), StateSizeError> {
    let roadmap: Vec<crate::RoadmapItem> = env
        .storage()
        .instance()
        .get(&DataKey::Roadmap)
        .unwrap_or_else(|| Vec::new(env));

    if roadmap.len() >= MAX_ROADMAP_ITEMS {
        return Err(StateSizeError::RoadmapLimitExceeded);
    }
    Ok(())
}

/// Assert that adding one more stretch goal is allowed.
///
/// @param env Soroban environment reference.
/// @return `Ok(())` when within limits, `Err(StateSizeError::StretchGoalLimitExceeded)` otherwise.
pub fn check_stretch_goal_limit(env: &Env) -> Result<(), StateSizeError> {
    let goals: Vec<i128> = env
        .storage()
        .instance()
        .get(&DataKey::StretchGoals)
        .unwrap_or_else(|| Vec::new(env));

    if goals.len() >= MAX_STRETCH_GOALS {
        return Err(StateSizeError::StretchGoalLimitExceeded);
    }
    Ok(())
}

