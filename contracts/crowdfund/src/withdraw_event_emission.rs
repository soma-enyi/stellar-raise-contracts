//! Bounded `withdraw()` Event Emission Module
//!
//! Provides three focused emit helpers and bounded NFT minting for the
//! crowdfund contract's `withdraw()` function.
//!
//! ## Security Invariants
//!
//! - [`emit_fee_transferred`] panics if `fee <= 0` — prevents silent zero-fee events.
//! - [`emit_nft_batch_minted`] panics if `minted_count == 0` — callers must guard.
//! - [`emit_withdrawn`] panics if `creator_payout <= 0` — prevents zero-payout withdrawals.
//!
//! ## Performance
//!
//! [`mint_nfts_in_batch`] caps NFT minting at [`MAX_NFT_MINT_BATCH`] per call,
//! bounding gas consumption and emitting a single summary event instead of O(n).

use soroban_sdk::{Address, Env, Vec};

use crate::{DataKey, NftContractClient, MAX_NFT_MINT_BATCH};

/// Mint NFTs to eligible contributors, capped at `MAX_NFT_MINT_BATCH`.
///
/// Emits a single `("campaign", "nft_batch_minted")` event with the count
/// when at least one NFT is minted. Returns 0 and emits nothing when
/// `nft_contract` is `None` or no contributor has a positive balance.
pub fn mint_nfts_in_batch(env: &Env, nft_contract: &Option<Address>) -> u32 {
    let Some(nft_addr) = nft_contract else {
        return 0;
    };

    let contributors: Vec<Address> = env
        .storage()
        .persistent()
        .get(&DataKey::Contributors)
        .unwrap_or_else(|| Vec::new(env));

    let client = NftContractClient::new(env, nft_addr);
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
            client.mint(&contributor);
            minted += 1;
        }
    }

    if minted > 0 {
        emit_nft_batch_minted(env, minted);
    }

    minted
}

/// Emit `("campaign", "fee_transferred")` with `(platform_address, fee)`.
///
/// # Panics
///
/// Panics if `fee <= 0` — a zero or negative fee transfer is a logic error.
pub fn emit_fee_transferred(env: &Env, platform: &Address, fee: i128) {
    assert!(fee > 0, "fee_transferred: fee must be positive");
    env.events()
        .publish(("campaign", "fee_transferred"), (platform.clone(), fee));
}

/// Emit `("campaign", "nft_batch_minted")` with the minted count.
///
/// # Panics
///
/// Panics if `minted_count == 0` — callers must only call this when minting occurred.
pub fn emit_nft_batch_minted(env: &Env, minted_count: u32) {
    assert!(
        minted_count > 0,
        "nft_batch_minted: minted_count must be positive"
    );
    env.events()
        .publish(("campaign", "nft_batch_minted"), minted_count);
}

/// Emit `("campaign", "withdrawn")` with `(creator, payout, nft_minted_count)`.
///
/// # Panics
///
/// Panics if `creator_payout <= 0` — a zero or negative payout is a logic error.
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
