//! Logging bounds for the Stellar token minter / crowdfund contract.
//!
//! Soroban contracts run inside a metered host environment where every event
//! emission and every storage read/write consumes CPU and memory instructions.
//! Unbounded iteration over contributor or pledger lists therefore creates a
//! denial-of-service vector: a campaign with thousands of contributors could
//! make `withdraw` or `collect_pledges` exceed the per-transaction resource
//! limits and become permanently un-callable.
//!
//! This module centralises the bound-checking logic so that:
//! * The limits are defined in one place and easy to audit.
//! * Helper functions can be unit-tested in isolation.
//! * The contract implementation stays readable.
//!
//! # Limits
//!
//! | Constant | Value | Governs |
//! |---|---|---|
//! | [`MAX_EVENTS_PER_TX`] | 100 | Total events emitted in one transaction |
//! | [`MAX_MINT_BATCH`] | 50 | NFT mints per `withdraw` call |
//! | [`MAX_LOG_ENTRIES`] | 200 | Diagnostic log entries per transaction |
//!
//! # Security assumptions
//!
//! * Limits are enforced **before** the loop that would exceed them, not after.
//! * All arithmetic uses `checked_*` to prevent overflow.
//! * No limit can be bypassed by the caller — they are compile-time constants.

use soroban_sdk::Env;

// ── Constants ────────────────────────────────────────────────────────────────

/// Maximum number of events that may be emitted in a single transaction.
///
/// Soroban's host enforces its own hard cap; this constant is a conservative
/// application-level guard that keeps us well below that limit.
pub const MAX_EVENTS_PER_TX: u32 = 100;

/// Maximum number of NFT mint calls (and their associated events) that
/// `withdraw` will process in one invocation.
///
/// Mirrors [`crate::MAX_NFT_MINT_BATCH`] and is re-exported here so that
/// tests can import it from a single location.
pub const MAX_MINT_BATCH: u32 = 50;

/// Maximum number of diagnostic log entries per transaction.
///
/// Kept separate from [`MAX_EVENTS_PER_TX`] because diagnostic logs are
/// cheaper but still bounded to prevent runaway output.
pub const MAX_LOG_ENTRIES: u32 = 200;

// ── Helpers ──────────────────────────────────────────────────────────────────

/// Returns `true` when `count` is within the per-transaction event budget.
///
/// # Arguments
/// * `count` – Number of events already scheduled for this transaction.
///
/// # Examples
/// ```ignore
/// assert!(within_event_budget(99));
/// assert!(!within_event_budget(100));
/// ```
#[inline]
pub fn within_event_budget(count: u32) -> bool {
    count < MAX_EVENTS_PER_TX
}

/// Returns `true` when `count` is within the NFT mint batch limit.
///
/// # Arguments
/// * `count` – Number of NFTs already minted in this `withdraw` call.
#[inline]
pub fn within_mint_batch(count: u32) -> bool {
    count < MAX_MINT_BATCH
}

/// Returns `true` when `count` is within the diagnostic log entry limit.
///
/// # Arguments
/// * `count` – Number of log entries already written in this transaction.
#[inline]
pub fn within_log_budget(count: u32) -> bool {
    count < MAX_LOG_ENTRIES
}

/// Calculates how many items can still be processed before the event budget
/// is exhausted, given that `reserved` events are already committed.
///
/// Returns `0` when the budget is already exhausted.
///
/// # Arguments
/// * `reserved` – Events already emitted or guaranteed to be emitted.
pub fn remaining_event_budget(reserved: u32) -> u32 {
    MAX_EVENTS_PER_TX.saturating_sub(reserved)
}

/// Calculates how many NFT mints remain in the current batch budget.
///
/// Returns `0` when the batch limit is already reached.
///
/// # Arguments
/// * `minted` – NFTs already minted in this `withdraw` call.
pub fn remaining_mint_budget(minted: u32) -> u32 {
    MAX_MINT_BATCH.saturating_sub(minted)
}

/// Emits a bounded summary event for a batch operation.
///
/// Instead of emitting one event per item (which would be unbounded), callers
/// emit a single summary event carrying the count of processed items.  This
/// function enforces that the summary is only emitted when `count > 0` and
/// that the event budget has not been exhausted.
///
/// # Arguments
/// * `env`      – The Soroban environment.
/// * `topic`    – Two-part event topic `(namespace, name)`.
/// * `count`    – Number of items processed in the batch.
/// * `emitted`  – Events already emitted in this transaction (budget check).
///
/// # Returns
/// `true` if the event was emitted, `false` if skipped (count == 0 or budget
/// exhausted).
pub fn emit_batch_summary(
    env: &Env,
    topic: (&'static str, &'static str),
    count: u32,
    emitted: u32,
) -> bool {
    if count == 0 || !within_event_budget(emitted) {
        return false;
    }
    env.events().publish((topic.0, topic.1), count);
    true
}
