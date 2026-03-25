//! Tests for initialize-function security and maintainability behavior.

use soroban_sdk::{testutils::Address as _, token, Address, Env, String as SorobanString};

use crate::{CrowdfundContract, CrowdfundContractClient};

/// @notice Build a test env with a minted creator balance.
fn setup() -> (Env, CrowdfundContractClient<'static>, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(CrowdfundContract, ());
    let client = CrowdfundContractClient::new(&env, &contract_id);

    let token_admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract_v2(token_admin);
    let token_address = token_id.address();
    let token_admin_client = token::StellarAssetClient::new(&env, &token_address);

    let creator = Address::generate(&env);
    token_admin_client.mint(&creator, &1_000_000);

    (env, client, creator, token_address)
}

/// @notice Ensure initialize rejects non-positive goal.
/// @security Prevents unusable or invalid campaigns from being instantiated.
#[test]
#[should_panic(expected = "goal must be positive")]
fn initialize_rejects_zero_goal() {
    let (env, client, creator, token) = setup();
    let deadline = env.ledger().timestamp() + 3_600;
    client.initialize(
        &creator, &creator, &token, &0, &deadline, &1_000, &None, &None, &None,
    );
}

/// @notice Ensure initialize rejects non-positive minimum contribution.
/// @security Blocks zero/negative minimums that break contribution invariants.
#[test]
#[should_panic(expected = "min contribution must be positive")]
fn initialize_rejects_zero_min_contribution() {
    let (env, client, creator, token) = setup();
    let deadline = env.ledger().timestamp() + 3_600;
    client.initialize(
        &creator, &creator, &token, &1_000_000, &deadline, &0, &None, &None, &None,
    );
}

/// @notice Ensure initialize rejects invalid platform fee over 100%.
#[test]
#[should_panic(expected = "platform fee cannot exceed 100%")]
fn initialize_rejects_fee_over_100_percent() {
    let (env, client, creator, token) = setup();
    let deadline = env.ledger().timestamp() + 3_600;
    let cfg = crate::PlatformConfig {
        address: Address::generate(&env),
        fee_bps: 10_001,
    };
    client.initialize(
        &creator,
        &creator,
        &token,
        &1_000_000,
        &deadline,
        &1_000,
        &Some(cfg),
        &None,
        &None,
    );
}

/// @notice Ensure initialize rejects bonus goal that is not above primary goal.
#[test]
#[should_panic(expected = "bonus goal must be greater than primary goal")]
fn initialize_rejects_non_increasing_bonus_goal() {
    let (env, client, creator, token) = setup();
    let deadline = env.ledger().timestamp() + 3_600;
    client.initialize(
        &creator,
        &creator,
        &token,
        &1_000_000,
        &deadline,
        &1_000,
        &None,
        &Some(1_000_000),
        &None,
    );
}

/// @notice Ensure initialize persists core configuration when inputs are valid.
#[test]
fn initialize_persists_expected_state() {
    let (env, client, creator, token) = setup();
    let deadline = env.ledger().timestamp() + 3_600;
    let desc = SorobanString::from_str(&env, "bonus for stretch delivery");
    client.initialize(
        &creator,
        &creator,
        &token,
        &1_000_000,
        &deadline,
        &1_000,
        &None,
        &Some(2_000_000),
        &Some(desc.clone()),
    );

    assert_eq!(client.goal(), 1_000_000);
    assert_eq!(client.min_contribution(), 1_000);
    assert_eq!(client.deadline(), deadline);
    assert_eq!(client.bonus_goal(), Some(2_000_000));
    assert_eq!(client.bonus_goal_description(), Some(desc));
}

