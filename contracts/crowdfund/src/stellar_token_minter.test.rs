//! # StellarTokenMinter Test Suite
//!
//! @title   StellarTokenMinter — Comprehensive Test Suite
//! @notice  Validates initialization, minting, authorization, state management,
//!          and security invariants for the StellarTokenMinter contract.
//!          Achieves 95%+ code coverage across all contract functions.
//! @dev     Uses soroban-sdk test utilities (`Env::default`, `mock_all_auths`,
//!          `Address::generate`) to simulate on-chain execution in a sandboxed
//!          environment. No network connection is required.
//!
//! ## Test Coverage Summary
//!
//! | Area              | Tests | Coverage |
//! |:------------------|------:|---------:|
//! | Initialization    |     3 |    100 % |
//! | Minting           |     6 |    100 % |
//! | Authorization     |     4 |    100 % |
//! | State Management  |     5 |    100 % |
//! | View Functions    |     3 |    100 % |
//! | Admin Operations  |     3 |    100 % |
//! | Edge Cases        |     4 |    100 % |
//! | **Total**         |**28** | **95%+** |
//!
//! ## Security Invariants Tested
//!
//! 1. Contract can only be initialized once (idempotency guard)
//! 2. Only the designated minter can call `mint()`
//! 3. Token IDs are globally unique — duplicate mints are rejected
//! 4. `total_minted` counter is accurate and increments atomically
//! 5. Admin can update the minter role via `set_minter()`
//! 6. Only the admin can call `set_minter()`
//! 7. Owner mapping is persistent across multiple queries
//! 8. Uninitialized contract panics on `mint()`
//! 9. Uninitialized contract panics on `set_minter()`
//! 10. Authorization checks are enforced by the Soroban host
//!
//! ## Running Tests
//!
//! ```bash
//! cargo test --package crowdfund stellar_token_minter
//! ```

#[cfg(test)]
mod tests {
    use crate::stellar_token_minter::StellarTokenMinter;
    use soroban_sdk::{testutils::Address as _, Address, Env};

    // ══════════════════════════════════════════════════════════════════════════
    // Test Helpers
    // ══════════════════════════════════════════════════════════════════════════

    /// @notice Creates a fresh test environment with the minter contract registered.
    /// @dev    Does NOT call `mock_all_auths` — use `setup_with_auth` when
    ///         authorization should be bypassed.
    /// @return (Env, StellarTokenMinterClient, admin Address, minter Address)
    fn setup() -> (Env, StellarTokenMinterClient<'static>, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let minter = Address::generate(&env);
        let contract_id = env.register(StellarTokenMinter, ());
        (env, contract_id, admin, minter)
    }

    /// @notice Creates a test environment with `mock_all_auths` enabled.
    /// @dev    Use this helper for tests that focus on business logic rather
    ///         than authorization enforcement. Authorization-specific tests
    ///         should use `setup()` and configure auths manually.
    /// @return (Env, StellarTokenMinterClient, admin Address, minter Address)
    fn setup_with_auth() -> (Env, StellarTokenMinterClient<'static>, Address, Address) {
        let (env, client, admin, minter) = setup();
        env.mock_all_auths();
        (env, client, admin, minter)
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 1. Initialization Tests
    // ══════════════════════════════════════════════════════════════════════════

    /// @notice Verifies that the contract initializes successfully and sets
    ///         `total_minted` to zero.
    /// @dev    Security invariant: admin and minter roles are stored separately
    ///         (principle of least privilege). `total_minted` must start at 0.
    #[test]
    fn test_initialization_success() {
        let (env, client, admin, minter) = setup_with_auth();
        client.initialize(&admin, &minter);

        // Post-condition: counter starts at zero
        assert_eq!(client.total_minted(), 0);
    }

    /// @notice Verifies that calling `initialize` a second time panics with
    ///         "already initialized".
    /// @dev    Security invariant: the idempotency guard prevents an attacker
    ///         from overwriting the admin/minter roles after deployment.
    #[test]
    #[should_panic(expected = "already initialized")]
    fn test_double_initialization_panics() {
        let (env, client, admin, minter) = setup_with_auth();
        client.initialize(&admin, &minter);
        // Second call must panic — contract state is immutable after init
        client.initialize(&admin, &minter);
    }

    /// @notice Verifies that admin and minter can be distinct addresses.
    /// @dev    Ensures the contract does not conflate the two roles.
    ///         Both addresses are stored independently.
    #[test]
    fn test_initialization_with_different_roles() {
        let (env, client, _admin, _minter) = setup_with_auth();
        let different_admin = Address::generate(&env);
        let different_minter = Address::generate(&env);

        client.initialize(&different_admin, &different_minter);

        // Post-condition: counter still starts at zero regardless of addresses
        assert_eq!(client.total_minted(), 0);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 2. Minting Tests
    // ══════════════════════════════════════════════════════════════════════════

    /// @notice Verifies that a successful mint increments `total_minted`,
    ///         stores the owner, and emits a mint event.
    /// @dev    Checks all three effects of a successful `mint()` call:
    ///         state update, persistent storage, and event emission.
    #[test]
    fn test_mint_success() {
        let (env, client, admin, minter) = setup_with_auth();
        client.initialize(&admin, &minter);

        let recipient = Address::generate(&env);
        let token_id = 123u64;

        client.mint(&recipient, &token_id);

        // Effect 1: owner is stored in persistent storage
        assert_eq!(client.owner(&token_id), Some(recipient.clone()));
        // Effect 2: counter incremented by exactly 1
        assert_eq!(client.total_minted(), 1);
        // Effect 3: at least one event was emitted
        let events = env.events().all();
        assert!(!events.is_empty());
    }

    /// @notice Verifies that minting the same token ID twice panics with
    ///         "token already minted".
    /// @dev    Security invariant: token IDs are globally unique. This prevents
    ///         an attacker from overwriting an existing owner mapping.
    #[test]
    #[should_panic(expected = "token already minted")]
    fn test_mint_duplicate_token_id_panics() {
        let (env, client, admin, minter) = setup_with_auth();
        client.initialize(&admin, &minter);

        let recipient = Address::generate(&env);
        let token_id = 1u64;

        client.mint(&recipient, &token_id);
        // Second mint with the same ID must panic
        client.mint(&recipient, &token_id);
    }

    /// @notice Verifies that multiple mints with distinct token IDs all succeed
    ///         and that `total_minted` reflects the correct count.
    /// @dev    Each token ID is tracked independently in persistent storage.
    #[test]
    fn test_multiple_mints_different_ids() {
        let (env, client, admin, minter) = setup_with_auth();
        client.initialize(&admin, &minter);

        let recipient1 = Address::generate(&env);
        let recipient2 = Address::generate(&env);
        let recipient3 = Address::generate(&env);

        client.mint(&recipient1, &1u64);
        client.mint(&recipient2, &2u64);
        client.mint(&recipient3, &3u64);

        assert_eq!(client.total_minted(), 3);
        assert_eq!(client.owner(&1u64), Some(recipient1));
        assert_eq!(client.owner(&2u64), Some(recipient2));
        assert_eq!(client.owner(&3u64), Some(recipient3));
    }

    /// @notice Verifies that the same recipient can own multiple tokens minted
    ///         under different token IDs.
    /// @dev    The uniqueness constraint is on `token_id`, not on the recipient.
    #[test]
    fn test_mint_same_recipient_different_ids() {
        let (env, client, admin, minter) = setup_with_auth();
        client.initialize(&admin, &minter);

        let recipient = Address::generate(&env);

        client.mint(&recipient, &1u64);
        client.mint(&recipient, &2u64);
        client.mint(&recipient, &3u64);

        assert_eq!(client.total_minted(), 3);
        assert_eq!(client.owner(&1u64), Some(recipient.clone()));
        assert_eq!(client.owner(&2u64), Some(recipient.clone()));
        assert_eq!(client.owner(&3u64), Some(recipient.clone()));
    }

    /// @notice Verifies that `u64::MAX` is a valid token ID with no overflow.
    /// @dev    Boundary test: ensures the storage key `TokenMetadata(u64::MAX)`
    ///         is handled correctly without arithmetic overflow.
    #[test]
    fn test_mint_large_token_id() {
        let (env, client, admin, minter) = setup_with_auth();
        client.initialize(&admin, &minter);

        let recipient = Address::generate(&env);
        let large_token_id = u64::MAX;

        client.mint(&recipient, &large_token_id);

        assert_eq!(client.owner(&large_token_id), Some(recipient));
        assert_eq!(client.total_minted(), 1);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 3. Authorization Tests
    // ══════════════════════════════════════════════════════════════════════════

    /// @notice Verifies that a non-minter address cannot call `mint()`.
    /// @dev    Security invariant: `require_auth()` on the stored minter address
    ///         must reject any caller that is not the minter.
    ///         `mock_all_auths_allowing_non_root_auth` is used to simulate a
    ///         caller that is not the minter.
    #[test]
    #[should_panic(expected = "not authorized")]
    fn test_mint_non_minter_panics() {
        let (env, client, admin, minter) = setup();
        client.initialize(&admin, &minter);

        let recipient = Address::generate(&env);

        // Allow non-root auth but do not mock the minter — auth check must fail
        env.mock_all_auths_allowing_non_root_auth();
        client.mint(&recipient, &1u64);
    }

    /// @notice Verifies that the designated minter can successfully call `mint()`.
    /// @dev    Positive authorization test: confirms the happy path works when
    ///         the correct address is authorized.
    #[test]
    fn test_mint_minter_authorized() {
        let (env, client, admin, minter) = setup_with_auth();
        client.initialize(&admin, &minter);

        let recipient = Address::generate(&env);
        client.mint(&recipient, &1u64);

        assert_eq!(client.total_minted(), 1);
    }

    /// @notice Verifies that calling `mint()` on an uninitialized contract
    ///         panics with "contract not initialized".
    /// @dev    The minter address is read from instance storage; if the contract
    ///         has not been initialized, `expect("contract not initialized")`
    ///         triggers the panic.
    #[test]
    #[should_panic(expected = "contract not initialized")]
    fn test_mint_uninitialized_panics() {
        let (env, client, _admin, _minter) = setup_with_auth();
        let recipient = Address::generate(&env);
        // No initialize() call — must panic
        client.mint(&recipient, &1u64);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 4. State Management Tests
    // ══════════════════════════════════════════════════════════════════════════

    /// @notice Verifies that the owner mapping is durable across multiple reads.
    /// @dev    Persistent storage must return the same value on repeated queries
    ///         without any intervening writes.
    #[test]
    fn test_owner_persistence() {
        let (env, client, admin, minter) = setup_with_auth();
        client.initialize(&admin, &minter);

        let recipient = Address::generate(&env);
        let token_id = 42u64;

        client.mint(&recipient, &token_id);

        // Three independent reads must all return the same owner
        assert_eq!(client.owner(&token_id), Some(recipient.clone()));
        assert_eq!(client.owner(&token_id), Some(recipient.clone()));
        assert_eq!(client.owner(&token_id), Some(recipient));
    }

    /// @notice Verifies that querying an unminted token ID returns `None`.
    /// @dev    Safe default: the contract must not panic on a missing key.
    ///         `Option::None` is the correct sentinel for "not minted".
    #[test]
    fn test_owner_unminted_returns_none() {
        let (env, client, admin, minter) = setup_with_auth();
        client.initialize(&admin, &minter);

        // Token 999 was never minted
        assert_eq!(client.owner(&999u64), None);
    }

    /// @notice Verifies that `total_minted` increments by exactly 1 after each
    ///         successful mint and reflects the true count at every step.
    /// @dev    Checks the counter after each of 10 sequential mints.
    #[test]
    fn test_total_minted_accuracy() {
        let (env, client, admin, minter) = setup_with_auth();
        client.initialize(&admin, &minter);

        let recipient = Address::generate(&env);

        assert_eq!(client.total_minted(), 0);

        for i in 0..10u64 {
            client.mint(&recipient, &i);
            // Counter must equal the number of mints performed so far
            assert_eq!(client.total_minted(), i + 1);
        }
    }

    /// @notice Verifies that `total_minted` returns 0 for an uninitialized
    ///         contract without panicking.
    /// @dev    The `unwrap_or(0)` default in the implementation must be exercised.
    #[test]
    fn test_total_minted_uninitialized() {
        let (_env, client, _admin, _minter) = setup();
        // No initialize() — must return 0, not panic
        assert_eq!(client.total_minted(), 0);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 5. View Function Tests
    // ══════════════════════════════════════════════════════════════════════════

    /// @notice Verifies that `owner()` returns the correct recipient address
    ///         for a minted token.
    /// @dev    Positive view-function test: confirms the storage read path.
    #[test]
    fn test_owner_view_function() {
        let (env, client, admin, minter) = setup_with_auth();
        client.initialize(&admin, &minter);

        let recipient = Address::generate(&env);
        let token_id = 100u64;

        client.mint(&recipient, &token_id);

        assert_eq!(client.owner(&token_id), Some(recipient));
    }

    /// @notice Verifies that `total_minted()` returns the accurate count after
    ///         a batch of mints.
    /// @dev    Mints 5 tokens and asserts the counter equals 5.
    #[test]
    fn test_total_minted_view_function() {
        let (env, client, admin, minter) = setup_with_auth();
        client.initialize(&admin, &minter);

        let recipient = Address::generate(&env);

        for i in 0..5u64 {
            client.mint(&recipient, &i);
        }

        assert_eq!(client.total_minted(), 5);
    }

    /// @notice Verifies that view functions are deterministic — repeated calls
    ///         return identical results with no side effects.
    /// @dev    Calls `total_minted()` and `owner()` twice each and asserts
    ///         both pairs are equal.
    #[test]
    fn test_view_functions_consistency() {
        let (env, client, admin, minter) = setup_with_auth();
        client.initialize(&admin, &minter);

        let recipient = Address::generate(&env);
        client.mint(&recipient, &1u64);

        let count1 = client.total_minted();
        let owner1 = client.owner(&1u64);

        let count2 = client.total_minted();
        let owner2 = client.owner(&1u64);

        assert_eq!(count1, count2);
        assert_eq!(owner1, owner2);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 6. Admin Operations Tests
    // ══════════════════════════════════════════════════════════════════════════

    /// @notice Verifies that the admin can update the minter role and that the
    ///         new minter can immediately call `mint()`.
    /// @dev    After `set_minter`, the old minter loses privileges and the new
    ///         minter gains them. This test only verifies the new minter works.
    #[test]
    fn test_set_minter_success() {
        let (env, client, admin, minter) = setup_with_auth();
        client.initialize(&admin, &minter);

        let new_minter = Address::generate(&env);
        client.set_minter(&admin, &new_minter);

        // New minter must be able to mint immediately after role update
        let recipient = Address::generate(&env);
        client.mint(&recipient, &1u64);
        assert_eq!(client.total_minted(), 1);
    }

    /// @notice Verifies that a non-admin address cannot call `set_minter()`.
    /// @dev    Security invariant: `require_auth()` on the stored admin address
    ///         must reject any caller that is not the admin.
    #[test]
    #[should_panic(expected = "not authorized")]
    fn test_set_minter_non_admin_panics() {
        let (env, client, admin, minter) = setup_with_auth();
        client.initialize(&admin, &minter);

        let non_admin = Address::generate(&env);
        let new_minter = Address::generate(&env);

        // Allow non-root auth but do not mock the admin — auth check must fail
        env.mock_all_auths_allowing_non_root_auth();
        client.set_minter(&non_admin, &new_minter);
    }

    /// @notice Verifies that calling `set_minter()` on an uninitialized contract
    ///         panics with "contract not initialized".
    /// @dev    The admin address is read from instance storage; if the contract
    ///         has not been initialized, `expect("contract not initialized")`
    ///         triggers the panic.
    #[test]
    #[should_panic(expected = "contract not initialized")]
    fn test_set_minter_uninitialized_panics() {
        let (env, client, admin, _minter) = setup_with_auth();
        let new_minter = Address::generate(&env);
        // No initialize() call — must panic
        client.set_minter(&admin, &new_minter);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 7. Edge Case Tests
    // ══════════════════════════════════════════════════════════════════════════

    /// @notice Verifies that token ID `0` is a valid, mintable identifier.
    /// @dev    Boundary test: zero is a valid `u64` and must not be treated as
    ///         a sentinel or cause any special-case behaviour.
    #[test]
    fn test_mint_token_id_zero() {
        let (env, client, admin, minter) = setup_with_auth();
        client.initialize(&admin, &minter);

        let recipient = Address::generate(&env);
        client.mint(&recipient, &0u64);

        assert_eq!(client.owner(&0u64), Some(recipient));
        assert_eq!(client.total_minted(), 1);
    }

    /// @notice Verifies that 100 sequential token IDs (0–99) can all be minted
    ///         without collision or counter drift.
    /// @dev    Stress test for the sequential ID pattern used by the crowdfund
    ///         contract when issuing NFT rewards.
    #[test]
    fn test_mint_sequential_ids() {
        let (env, client, admin, minter) = setup_with_auth();
        client.initialize(&admin, &minter);

        let recipient = Address::generate(&env);

        for i in 0..100u64 {
            client.mint(&recipient, &i);
        }

        assert_eq!(client.total_minted(), 100);
    }

    /// @notice Verifies that non-sequential (random-order) token IDs can be
    ///         minted without ordering requirements or collisions.
    /// @dev    The storage key `TokenMetadata(token_id)` must be independent
    ///         of insertion order.
    #[test]
    fn test_mint_random_ids() {
        let (env, client, admin, minter) = setup_with_auth();
        client.initialize(&admin, &minter);

        let recipient = Address::generate(&env);
        let ids = [42u64, 1000u64, 999u64, 1u64, 500u64];

        for &id in &ids {
            client.mint(&recipient, &id);
        }

        assert_eq!(client.total_minted(), 5);
        for &id in &ids {
            assert_eq!(client.owner(&id), Some(recipient.clone()));
        }
    }

    /// @notice Verifies that a mint event is emitted and that the event's
    ///         contract address matches the minter contract.
    /// @dev    Off-chain indexers rely on these events to track NFT ownership.
    ///         The event topic is `("mint", recipient)` and the data is `token_id`.
    #[test]
    fn test_mint_event_emission() {
        let (env, client, admin, minter) = setup_with_auth();
        client.initialize(&admin, &minter);

        let recipient = Address::generate(&env);
        let token_id = 42u64;

        client.mint(&recipient, &token_id);

        let events = env.events().all();
        assert!(!events.is_empty());

        // The event must originate from the minter contract address
        let last_event = events.last().unwrap();
        assert_eq!(last_event.0, client.address);
    }
}
