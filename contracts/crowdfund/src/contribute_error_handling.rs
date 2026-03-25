//! contribute() error handling — deprecates old panic-based logic.
//!
//! All previously untyped panics in `contribute()` are now returned as typed
//! `ContractError` variants, enabling scripts and CI/CD pipelines to handle
//! errors programmatically.
//!
//! # Error taxonomy for `contribute()`
//!
//! | Code | Variant              | Trigger                                          |
//! |------|----------------------|--------------------------------------------------|
//! |  2   | `CampaignEnded`      | `ledger.timestamp > deadline`                    |
//! |  6   | `Overflow`           | contribution or total_raised would overflow      |
//! |  8   | `ZeroAmount`         | `amount == 0`                                    |
//! |  9   | `BelowMinimum`       | `amount < min_contribution`                      |
//! | 10   | `CampaignNotActive`  | campaign status is not `Active`                  |
//!
//! # Deprecation notice
//!
//! The following panic-based guards have been **deprecated** and replaced with
//! typed errors:
//!
//! - `panic!("amount below minimum")` → `ContractError::BelowMinimum` (code 9)
//! - implicit zero-amount pass-through → `ContractError::ZeroAmount` (code 8)
//! - no status guard → `ContractError::CampaignNotActive` (code 10)
//!
//! # Security assumptions
//!
//! - `contributor.require_auth()` is called before any state mutation.
//! - Token transfer happens before storage writes; failures roll back atomically.
//! - Overflow is caught with `checked_add` on both per-contributor and global totals.
//! - The deadline check uses strict `>`, so contributions at exactly the deadline
//!   timestamp are accepted.
//! - Campaign status is checked first, so cancelled/successful campaigns are
//!   rejected before any other validation.

/// Numeric error codes returned by the contract host for `contribute()`.
/// Mirrors `ContractError` repr values for use in off-chain scripts.
pub mod error_codes {
    /// `contribute()` was called after the campaign deadline.
    pub const CAMPAIGN_ENDED: u32 = 2;
    /// A checked arithmetic operation overflowed.
    pub const OVERFLOW: u32 = 6;
    /// `amount` was zero.
    pub const ZERO_AMOUNT: u32 = 8;
    /// `amount` was below `min_contribution`.
    pub const BELOW_MINIMUM: u32 = 9;
    /// Campaign status is not `Active`.
    pub const CAMPAIGN_NOT_ACTIVE: u32 = 10;
}

/// Returns a human-readable description for a `contribute()` error code.
pub fn describe_error(code: u32) -> &'static str {
    match code {
        error_codes::CAMPAIGN_ENDED => "Campaign has ended",
        error_codes::OVERFLOW => "Arithmetic overflow — contribution amount too large",
        error_codes::ZERO_AMOUNT => "Contribution amount must be greater than zero",
        error_codes::BELOW_MINIMUM => "Contribution amount is below the minimum required",
        error_codes::CAMPAIGN_NOT_ACTIVE => "Campaign is not active",
        _ => "Unknown error",
    }
}

/// Returns `true` if the error code is retryable by the caller.
///
/// None of the `contribute()` errors are retryable without a state change.
pub fn is_retryable(_code: u32) -> bool {
    false
}

/// Emits a structured diagnostic event for a `contribute()` error.
///
/// # Event schema
///
/// | Field   | Value                                      |
/// |---------|--------------------------------------------|
/// | topic 0 | `Symbol("contribute_error")`               |
/// | topic 1 | `Symbol(<variant_name>)`                   |
/// | data    | `u32` error code                           |
///
/// Scripts and monitoring tools can subscribe to `contribute_error` events to
/// observe failures without parsing host-level error codes.
///
/// # Security
///
/// This function only emits read-only diagnostic data. It does not mutate
/// contract state and cannot be called externally — it is invoked exclusively
/// from within `contribute()` before the error is returned to the caller.
pub fn log_contribute_error(env: &soroban_sdk::Env, error: crate::ContractError) {
    use soroban_sdk::Symbol;
    let (variant, code) = match error {
        crate::ContractError::CampaignEnded => (
            Symbol::new(env, "CampaignEnded"),
            error_codes::CAMPAIGN_ENDED,
        ),
        crate::ContractError::Overflow => {
            (Symbol::new(env, "Overflow"), error_codes::OVERFLOW)
        }
        crate::ContractError::ZeroAmount => {
            (Symbol::new(env, "ZeroAmount"), error_codes::ZERO_AMOUNT)
        }
        crate::ContractError::BelowMinimum => {
            (Symbol::new(env, "BelowMinimum"), error_codes::BELOW_MINIMUM)
        }
        crate::ContractError::CampaignNotActive => (
            Symbol::new(env, "CampaignNotActive"),
            error_codes::CAMPAIGN_NOT_ACTIVE,
        ),
        _ => return, // non-contribute errors are not logged here
    };
    env.events()
        .publish(("contribute_error", variant), code);
}
