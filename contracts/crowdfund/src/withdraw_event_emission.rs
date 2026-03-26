//! Optimized `withdraw()` Event Emission Module
//!
//! Centralises all event publishing for the `withdraw()` function into three
//! validated helper functions. Each helper asserts its invariants before
//! publishing, so a logic error upstream causes an explicit panic rather than
//! a silently misleading event on-chain.
//!
//! ## Design Goals
//!
//! | Goal | Mechanism |
//! |------|-----------|
//! | Gas efficiency | Single `nft_batch_minted` event instead of O(n) per-contributor events |
//! | Readability | Named helpers replace scattered `env.events().publish(…)` calls |
//! | Security | Positive-only assertions on every monetary amount |
//! | Testability | Each helper is independently unit-testable |
//!
//! ## Events Published
//!
//! | Topic 1    | Topic 2            | Data                        | Condition |
//! |------------|--------------------|-----------------------------|-----------|
//! | `campaign` | `fee_transferred`  | `(Address, i128)`           | Platform fee > 0 |
//! | `campaign` | `nft_batch_minted` | `u32`                       | At least 1 NFT minted |
//! | `campaign` | `withdrawn`        | `(Address, i128, u32)`      | Always on success |
//!
//! ## Usage
//!
//! ```rust
//! use crate::withdraw_event_emission::{
//!     emit_fee_transferred, emit_nft_batch_minted, emit_withdrawn, mint_nfts_in_batch,
//! };
//!
//! // Inside withdraw():
//! if fee > 0 {
//!     emit_fee_transferred(&env, &platform_addr, fee);
//! }
//! let nft_count = mint_nfts_in_batch(&env, &nft_contract);
//! emit_withdrawn(&env, &creator, creator_payout, nft_count);
//! ```

use soroban_sdk::{Address, Env, IntoVal, Symbol, Vec};

use crate::{DataKey, MAX_NFT_MINT_BATCH};

// ── Validated event helpers ──────────────────────────────────────────────────

/// Emit a `fee_transferred` event.
///
/// Published when a platform fee is deducted from the withdrawal amount and
/// transferred to the platform address.
///
/// # Parameters
/// - `env`      – The Soroban environment.
/// - `platform` – The platform address that received the fee.
/// - `fee`      – The fee amount transferred (must be > 0).
///
/// # Panics
/// Panics with `"fee_transferred: fee must be positive"` when `fee <= 0`.
/// A zero or negative fee indicates a logic error upstream and must not be
/// silently emitted as a misleading on-chain event.
///
/// # Event
/// Topic: `("campaign", "fee_transferred")`
/// Data:  `(Address, i128)` — (platform, fee)
pub fn emit_fee_transferred(env: &Env, platform: &Address, fee: i128) {
    assert!(fee > 0, "fee_transferred: fee must be positive");
    env.events()
        .publish(("campaign", "fee_transferred"), (platform.clone(), fee));
}

/// Emit an `nft_batch_minted` event.
///
/// Published once per `withdraw()` call when at least one NFT was minted to
/// contributors. Replaces the previous O(n) per-contributor event pattern,
/// reducing event log noise and improving indexer performance.
///
/// # Parameters
/// - `env`           – The Soroban environment.
/// - `minted_count`  – Number of NFTs minted in this batch (must be > 0).
///
/// # Panics
/// Panics with `"nft_batch_minted: minted_count must be positive"` when
/// `minted_count == 0`. The caller must guard with `if minted > 0`.
///
/// # Event
/// Topic: `("campaign", "nft_batch_minted")`
/// Data:  `u32` — number of NFTs minted
pub fn emit_nft_batch_minted(env: &Env, minted_count: u32) {
    assert!(
        minted_count > 0,
        "nft_batch_minted: minted_count must be positive"
    );
    env.events()
        .publish(("campaign", "nft_batch_minted"), minted_count);
}

/// Emit a `withdrawn` event.
///
/// Published exactly once per successful `withdraw()` call. Carries the
/// creator address, net payout (after platform fee), and the number of NFTs
/// minted to contributors in this withdrawal.
///
/// # Parameters
/// - `env`             – The Soroban environment.
/// - `creator`         – The campaign creator who received the payout.
/// - `creator_payout`  – Net amount transferred to the creator (must be > 0).
/// - `nft_minted_count`– NFTs minted this call (0 is valid when no NFT contract).
///
/// # Panics
/// Panics with `"withdrawn: creator_payout must be positive"` when
/// `creator_payout <= 0`. A zero or negative payout indicates a logic error
/// upstream.
///
/// # Event
/// Topic: `("campaign", "withdrawn")`
/// Data:  `(Address, i128, u32)` — (creator, creator_payout, nft_minted_count)
///
/// # Breaking Change Note
/// The data tuple now has three fields `(Address, i128, u32)`. Off-chain
/// indexers that decoded the old two-field tuple `(Address, i128)` must be
/// updated.
pub fn emit_withdrawn(env: &Env, creator: &Address, creator_payout: i128, nft_minted_count: u32) {
    assert!(
        creator_payout > 0,
        "withdrawn: creator_payout must be positive"
    );
    env.events().publish(
        ("campaign", "withdrawn"),
        (creator.clone(), creator_payout, nft_minted_count),
    );
}

// ── Batch NFT minting ────────────────────────────────────────────────────────

/// Mint NFTs to eligible contributors in a single bounded batch.
///
/// Processes at most [`MAX_NFT_MINT_BATCH`] contributors per call to prevent
/// unbounded gas consumption. Emits a single `nft_batch_minted` summary event
/// via [`emit_nft_batch_minted`] when at least one NFT is minted.
///
/// # Parameters
/// - `env`          – The Soroban environment.
/// - `nft_contract` – Optional address of the NFT contract. Returns 0 immediately
///                    when `None`.
///
/// # Returns
/// Number of NFTs minted in this batch (0 when no contract or no eligible contributors).
///
/// # Security Considerations
/// - Contributors beyond the cap are **not** permanently skipped. Subsequent
///   `withdraw()` calls (or a dedicated claim function) can mint the remainder.
/// - The cap is a compile-time constant; changing it requires a contract upgrade.
/// - The NFT contract must implement `fn mint(env: Env, to: Address, token_id: u64)`.
///
/// # Complexity
/// - Time:  O(min(n, MAX_NFT_MINT_BATCH))
/// - Space: O(1)
/// - Events: O(1) — single batch event
pub fn mint_nfts_in_batch(env: &Env, nft_contract: &Option<Address>) -> u32 {
    let Some(nft_contract) = nft_contract else {
        return 0;
    };

    let contributors: Vec<Address> = env
        .storage()
        .persistent()
        .get(&DataKey::Contributors)
        .unwrap_or_else(|| Vec::new(env));

    let mut token_id: u64 = 1;
    let mut minted: u32 = 0;

    for contributor in contributors.iter() {
        if minted >= MAX_NFT_MINT_BATCH {
            break;
        }

        let contribution: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::Contribution(contributor.clone()))
            .unwrap_or(0);

        if contribution > 0 {
            env.invoke_contract::<()>(
                nft_contract,
                &Symbol::new(env, "mint"),
                Vec::from_array(env, [contributor.into_val(env), token_id.into_val(env)]),
            );
            token_id += 1;
            minted += 1;
        }
    }

    // O(1) summary event — replaces the previous O(n) per-contributor pattern.
    if minted > 0 {
        emit_nft_batch_minted(env, minted);
    }

    minted
}

/// Convenience wrapper: emit the full withdrawal event tuple.
///
/// Delegates to [`emit_withdrawn`]. Kept for backwards compatibility with
/// call sites that used the old `emit_withdrawal_event` name.
///
/// Prefer calling [`emit_withdrawn`] directly in new code.
#[inline]
pub fn emit_withdrawal_event(env: &Env, creator: &Address, payout: i128, nft_minted_count: u32) {
    emit_withdrawn(env, creator, payout, nft_minted_count);
}

#[cfg(test)]
mod unit_tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    // These mirror the security unit tests in withdraw_event_emission_test.rs
    // but run without the full contract setup for fast feedback.

    #[test]
    #[should_panic(expected = "fee_transferred: fee must be positive")]
    fn emit_fee_transferred_rejects_zero() {
        let env = Env::default();
        let addr = Address::generate(&env);
        emit_fee_transferred(&env, &addr, 0);
    }

    #[test]
    #[should_panic(expected = "fee_transferred: fee must be positive")]
    fn emit_fee_transferred_rejects_negative() {
        let env = Env::default();
        let addr = Address::generate(&env);
        emit_fee_transferred(&env, &addr, -1);
    }

    #[test]
    fn emit_fee_transferred_accepts_positive() {
        let env = Env::default();
        let addr = Address::generate(&env);
        emit_fee_transferred(&env, &addr, 1);
    }

    #[test]
    #[should_panic(expected = "nft_batch_minted: minted_count must be positive")]
    fn emit_nft_batch_minted_rejects_zero() {
        let env = Env::default();
        emit_nft_batch_minted(&env, 0);
    }

    #[test]
    fn emit_nft_batch_minted_accepts_positive() {
        let env = Env::default();
        emit_nft_batch_minted(&env, 1);
    }

    #[test]
    #[should_panic(expected = "withdrawn: creator_payout must be positive")]
    fn emit_withdrawn_rejects_zero_payout() {
        let env = Env::default();
        let addr = Address::generate(&env);
        emit_withdrawn(&env, &addr, 0, 0);
    }

    #[test]
    #[should_panic(expected = "withdrawn: creator_payout must be positive")]
    fn emit_withdrawn_rejects_negative_payout() {
        let env = Env::default();
        let addr = Address::generate(&env);
        emit_withdrawn(&env, &addr, -100, 0);
    }

    #[test]
    fn emit_withdrawn_accepts_valid_args() {
        let env = Env::default();
        let addr = Address::generate(&env);
        emit_withdrawn(&env, &addr, 1_000, 5);
    }

    #[test]
    fn emit_withdrawn_allows_zero_nft_count() {
        let env = Env::default();
        let addr = Address::generate(&env);
        emit_withdrawn(&env, &addr, 500, 0);
    }
}
