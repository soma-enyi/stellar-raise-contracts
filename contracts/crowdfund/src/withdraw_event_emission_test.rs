//! Comprehensive tests for bounded `withdraw()` event emission.
//!
//! Covers:
//! - NFT minting cap (below, at, and above `MAX_NFT_MINT_BATCH`)
//! - Single `nft_batch_minted` summary event (not one per contributor)
//! - `withdrawn` event emitted exactly once with correct payload
//! - `fee_transferred` event emitted with correct payload
//! - No `nft_batch_minted` event when NFT contract is not configured
//! - Security: `emit_fee_transferred` panics on zero/negative fee
//! - Security: `emit_nft_batch_minted` panics on zero count
//! - Security: `emit_withdrawn` panics on zero/negative payout
//! - `withdrawn` event payout reflects platform fee deduction
//! - Double-withdraw is blocked (status guard)

extern crate std;

use soroban_sdk::{
    contract, contractimpl, contracttype,
    testutils::{Address as _, Events, Ledger},
    token, Address, Env, String, TryFromVal, Val,
};

use crate::{
    withdraw_event_emission::{emit_fee_transferred, emit_nft_batch_minted, emit_withdrawn},
    CrowdfundContract, CrowdfundContractClient, PlatformConfig, MAX_NFT_MINT_BATCH,
};

// ── Minimal mock NFT contract ────────────────────────────────────────────────

#[derive(Clone)]
#[contracttype]
enum BoundedNftKey {
    Count,
}

#[contract]
struct BoundedMockNft;

#[contractimpl]
impl BoundedMockNft {
    pub fn mint(env: Env, _to: Address) -> u128 {
        let n: u32 = env
            .storage()
            .instance()
            .get(&BoundedNftKey::Count)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&BoundedNftKey::Count, &(n + 1));
        n as u128
    }
    pub fn count(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&BoundedNftKey::Count)
            .unwrap_or(0)
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

fn setup_with_nft(
    contributor_count: u32,
) -> (Env, CrowdfundContractClient<'static>, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(CrowdfundContract, ());
    let client = CrowdfundContractClient::new(&env, &contract_id);

    let token_admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_addr = token_id.address();
    let sac = token::StellarAssetClient::new(&env, &token_addr);

    let creator = Address::generate(&env);
    let deadline = env.ledger().timestamp() + 3600;

    client.initialize(
        &creator,
        &creator,
        &token_addr,
        &(contributor_count as i128 * 100),
        &deadline,
        &1,
        &None,
        &None,
        &None,
        &None,
    );

    let nft_id = env.register(BoundedMockNft, ());
    client.set_nft_contract(&creator, &nft_id);

    for _ in 0..contributor_count {
        let c = Address::generate(&env);
        sac.mint(&c, &100);
        client.contribute(&c, &100);
    }

    env.ledger().set_timestamp(deadline + 1);
    client.finalize();
    (env, client, creator, token_addr, nft_id)
}

fn setup_no_nft(
    contribution: i128,
) -> (Env, CrowdfundContractClient<'static>, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(CrowdfundContract, ());
    let client = CrowdfundContractClient::new(&env, &contract_id);

    let token_admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_addr = token_id.address();
    let sac = token::StellarAssetClient::new(&env, &token_addr);

    let creator = Address::generate(&env);
    let deadline = env.ledger().timestamp() + 3600;

    client.initialize(
        &creator,
        &creator,
        &token_addr,
        &contribution,
        &deadline,
        &1,
        &None,
        &None,
        &None,
        &None,
    );

    let contributor = Address::generate(&env);
    sac.mint(&contributor, &contribution);
    client.contribute(&contributor, &contribution);

    env.ledger().set_timestamp(deadline + 1);
    client.finalize();
    (env, client, creator, token_addr)
}

fn count_events_with_topic(env: &Env, t1: &str, t2: &str) -> usize {
    let s1 = String::from_str(env, t1);
    let s2 = String::from_str(env, t2);
    env.events()
        .all()
        .iter()
        .filter(|(_, topics, _)| {
            if topics.len() < 2 {
                return false;
            }
            let v1 = topics.get(0).unwrap();
            let v2 = topics.get(1).unwrap();
            String::try_from_val(env, &v1)
                .map(|s| s == s1)
                .unwrap_or(false)
                && String::try_from_val(env, &v2)
                    .map(|s| s == s2)
                    .unwrap_or(false)
        })
        .count()
}

fn first_event_data(env: &Env, t1: &str, t2: &str) -> Option<Val> {
    let s1 = String::from_str(env, t1);
    let s2 = String::from_str(env, t2);
    env.events()
        .all()
        .iter()
        .find(|(_, topics, _)| {
            if topics.len() < 2 {
                return false;
            }
            let v1 = topics.get(0).unwrap();
            let v2 = topics.get(1).unwrap();
            String::try_from_val(env, &v1)
                .map(|s| s == s1)
                .unwrap_or(false)
                && String::try_from_val(env, &v2)
                    .map(|s| s == s2)
                    .unwrap_or(false)
        })
        .map(|(_, _, data)| data)
}

// ── NFT minting cap tests ────────────────────────────────────────────────────

#[test]
fn test_withdraw_mints_all_when_within_cap() {
    let count = MAX_NFT_MINT_BATCH - 1;
    let (env, client, _creator, _token, nft_id) = setup_with_nft(count);
    client.withdraw();
    let nft = BoundedMockNftClient::new(&env, &nft_id);
    assert_eq!(nft.count(), count);
}

#[test]
fn test_withdraw_caps_minting_at_max_batch() {
    let count = MAX_NFT_MINT_BATCH + 10;
    let (env, client, _creator, _token, nft_id) = setup_with_nft(count);
    client.withdraw();
    let nft = BoundedMockNftClient::new(&env, &nft_id);
    assert_eq!(nft.count(), MAX_NFT_MINT_BATCH);
}

#[test]
fn test_withdraw_mints_exactly_at_cap_boundary() {
    let (env, client, _creator, _token, nft_id) = setup_with_nft(MAX_NFT_MINT_BATCH);
    client.withdraw();
    let nft = BoundedMockNftClient::new(&env, &nft_id);
    assert_eq!(nft.count(), MAX_NFT_MINT_BATCH);
}

#[test]
fn test_withdraw_mints_single_contributor() {
    let (env, client, _creator, _token, nft_id) = setup_with_nft(1);
    client.withdraw();
    let nft = BoundedMockNftClient::new(&env, &nft_id);
    assert_eq!(nft.count(), 1);
}

// ── nft_batch_minted event tests ─────────────────────────────────────────────

#[test]
fn test_withdraw_emits_single_batch_event() {
    let (env, client, _creator, _token, _nft_id) = setup_with_nft(5);
    client.withdraw();
    assert_eq!(
        count_events_with_topic(&env, "campaign", "nft_batch_minted"),
        1
    );
}

#[test]
fn test_withdraw_no_batch_event_without_nft_contract() {
    let (env, client, _creator, _token) = setup_no_nft(1_000);
    client.withdraw();
    assert_eq!(
        count_events_with_topic(&env, "campaign", "nft_batch_minted"),
        0
    );
}

#[test]
fn test_withdraw_batch_event_data_equals_minted_count() {
    let count: u32 = 3;
    let (env, client, _creator, _token, _nft_id) = setup_with_nft(count);
    client.withdraw();
    let data = first_event_data(&env, "campaign", "nft_batch_minted")
        .expect("nft_batch_minted event not found");
    let minted: u32 = u32::try_from_val(&env, &data).expect("data is not u32");
    assert_eq!(minted, count);
}

#[test]
fn test_withdraw_batch_event_data_capped_at_max() {
    let count = MAX_NFT_MINT_BATCH + 5;
    let (env, client, _creator, _token, _nft_id) = setup_with_nft(count);
    client.withdraw();
    let data = first_event_data(&env, "campaign", "nft_batch_minted")
        .expect("nft_batch_minted event not found");
    let minted: u32 = u32::try_from_val(&env, &data).expect("data is not u32");
    assert_eq!(minted, MAX_NFT_MINT_BATCH);
}

// ── withdrawn event tests ────────────────────────────────────────────────────

#[test]
fn test_withdraw_emits_withdrawn_event_once() {
    let (env, client, _creator, _token, _nft_id) = setup_with_nft(2);
    client.withdraw();
    assert_eq!(count_events_with_topic(&env, "campaign", "withdrawn"), 1);
}

#[test]
fn test_withdraw_emits_withdrawn_event_without_nft() {
    let (env, client, _creator, _token) = setup_no_nft(1_000);
    client.withdraw();
    assert_eq!(count_events_with_topic(&env, "campaign", "withdrawn"), 1);
}

#[test]
fn test_withdrawn_event_nft_count_zero_without_nft_contract() {
    let (env, client, _creator, _token) = setup_no_nft(1_000);
    client.withdraw();
    let data =
        first_event_data(&env, "campaign", "withdrawn").expect("withdrawn event not found");
    let tuple: (Address, i128, u32) =
        <(Address, i128, u32)>::try_from_val(&env, &data).expect("data shape mismatch");
    assert_eq!(tuple.2, 0u32);
}

#[test]
fn test_withdrawn_event_payout_equals_total_raised_no_fee() {
    let contribution: i128 = 5_000;
    let (env, client, creator, _token) = setup_no_nft(contribution);
    client.withdraw();
    let data =
        first_event_data(&env, "campaign", "withdrawn").expect("withdrawn event not found");
    let tuple: (Address, i128, u32) =
        <(Address, i128, u32)>::try_from_val(&env, &data).expect("data shape mismatch");
    assert_eq!(tuple.0, creator);
    assert_eq!(tuple.1, contribution);
}

#[test]
fn test_withdrawn_event_payout_reflects_fee_deduction() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(CrowdfundContract, ());
    let client = CrowdfundContractClient::new(&env, &contract_id);

    let token_admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_addr = token_id.address();
    let sac = token::StellarAssetClient::new(&env, &token_addr);

    let creator = Address::generate(&env);
    let platform_addr = Address::generate(&env);
    let deadline = env.ledger().timestamp() + 3600;
    let goal: i128 = 1_000_000;

    client.initialize(
        &creator,
        &creator,
        &token_addr,
        &goal,
        &deadline,
        &1,
        &Some(PlatformConfig { address: platform_addr, fee_bps: 500 }),
        &None,
        &None,
        &None,
    );

    let contributor = Address::generate(&env);
    sac.mint(&contributor, &goal);
    client.contribute(&contributor, &goal);
    env.ledger().set_timestamp(deadline + 1);
    client.finalize();
    client.withdraw();

    let data =
        first_event_data(&env, "campaign", "withdrawn").expect("withdrawn event not found");
    let tuple: (Address, i128, u32) =
        <(Address, i128, u32)>::try_from_val(&env, &data).expect("data shape mismatch");
    // 5% of 1_000_000 = 50_000 fee; creator payout = 950_000
    assert_eq!(tuple.1, 950_000);
}

// ── fee_transferred event tests ──────────────────────────────────────────────

#[test]
fn test_withdraw_emits_fee_transferred_event() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(CrowdfundContract, ());
    let client = CrowdfundContractClient::new(&env, &contract_id);

    let token_admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_addr = token_id.address();
    let sac = token::StellarAssetClient::new(&env, &token_addr);

    let creator = Address::generate(&env);
    let platform_addr = Address::generate(&env);
    let deadline = env.ledger().timestamp() + 3600;
    let goal: i128 = 1_000_000;

    client.initialize(
        &creator,
        &creator,
        &token_addr,
        &goal,
        &deadline,
        &1,
        &Some(PlatformConfig { address: platform_addr, fee_bps: 200 }),
        &None,
        &None,
        &None,
    );

    let contributor = Address::generate(&env);
    sac.mint(&contributor, &goal);
    client.contribute(&contributor, &goal);
    env.ledger().set_timestamp(deadline + 1);
    client.finalize();
    client.withdraw();

    assert_eq!(
        count_events_with_topic(&env, "campaign", "fee_transferred"),
        1
    );
}

#[test]
fn test_withdraw_no_fee_transferred_event_without_platform_config() {
    let (env, client, _creator, _token) = setup_no_nft(1_000);
    client.withdraw();
    assert_eq!(
        count_events_with_topic(&env, "campaign", "fee_transferred"),
        0
    );
}

// ── Double-withdraw guard ────────────────────────────────────────────────────

#[test]
#[should_panic]
fn test_double_withdraw_panics() {
    let (_, client, _creator, _token, _nft_id) = setup_with_nft(1);
    client.withdraw();
    client.withdraw(); // must panic — status is no longer Succeeded
}

// ── Unit tests for emit helpers (security assertions) ────────────────────────

#[test]
#[should_panic(expected = "fee_transferred: fee must be positive")]
fn test_emit_fee_transferred_panics_on_zero_fee() {
    let env = Env::default();
    let addr = Address::generate(&env);
    emit_fee_transferred(&env, &addr, 0);
}

#[test]
#[should_panic(expected = "fee_transferred: fee must be positive")]
fn test_emit_fee_transferred_panics_on_negative_fee() {
    let env = Env::default();
    let addr = Address::generate(&env);
    emit_fee_transferred(&env, &addr, -1);
}

#[test]
fn test_emit_fee_transferred_succeeds_with_positive_fee() {
    let env = Env::default();
    let addr = Address::generate(&env);
    emit_fee_transferred(&env, &addr, 1);
}

#[test]
#[should_panic(expected = "nft_batch_minted: minted_count must be positive")]
fn test_emit_nft_batch_minted_panics_on_zero_count() {
    let env = Env::default();
    emit_nft_batch_minted(&env, 0);
}

#[test]
fn test_emit_nft_batch_minted_succeeds_with_positive_count() {
    let env = Env::default();
    emit_nft_batch_minted(&env, 1);
}

#[test]
#[should_panic(expected = "withdrawn: creator_payout must be positive")]
fn test_emit_withdrawn_panics_on_zero_payout() {
    let env = Env::default();
    let addr = Address::generate(&env);
    emit_withdrawn(&env, &addr, 0, 0);
}

#[test]
#[should_panic(expected = "withdrawn: creator_payout must be positive")]
fn test_emit_withdrawn_panics_on_negative_payout() {
    let env = Env::default();
    let addr = Address::generate(&env);
    emit_withdrawn(&env, &addr, -100, 0);
}

#[test]
fn test_emit_withdrawn_succeeds_with_valid_args() {
    let env = Env::default();
    let addr = Address::generate(&env);
    emit_withdrawn(&env, &addr, 1_000, 5);
}

#[test]
fn test_emit_withdrawn_allows_zero_nft_count() {
    let env = Env::default();
    let addr = Address::generate(&env);
    emit_withdrawn(&env, &addr, 500, 0);
}
