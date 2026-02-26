#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, token, Address, Env, Vec};

#[cfg(test)]
mod test;

// ── Data Keys ───────────────────────────────────────────────────────────────

#[derive(Clone, PartialEq)]
#[contracttype]
pub enum Status {
    Active,
    Successful,
    Refunded,
    Cancelled,
}

#[derive(Clone)]
#[contracttype]
pub struct CampaignStats {
    pub total_raised: i128,
    pub goal: i128,
    pub progress_bps: u32,
    pub contributor_count: u32,
    pub average_contribution: i128,
    pub largest_contribution: i128,
}

#[derive(Clone)]
#[contracttype]
pub struct PlatformConfig {
    pub address: Address,
    pub fee_bps: u32,
}

#[derive(Clone)]
#[contracttype]
pub struct FeeTier {
    pub threshold: i128,
    pub fee_bps: u32,
}

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    /// The address of the campaign creator.
    Creator,
    /// The token used for contributions (e.g. USDC).
    Token,
    /// The funding goal in the token's smallest unit.
    Goal,
    /// The deadline as a ledger timestamp.
    Deadline,
    /// Total amount raised so far.
    TotalRaised,
    /// Individual contribution by address.
    Contribution(Address),
    /// List of all contributor addresses.
    Contributors,
    /// Campaign status (Active, Successful, Refunded).
    Status,
    /// Minimum contribution amount.
    MinContribution,
    /// Platform configuration for fee handling.
    PlatformConfig,
    /// Fee tiers for dynamic fee calculation.
    FeeTiers,
}

// ── Contract ────────────────────────────────────────────────────────────────

#[contract]
pub struct CrowdfundContract;

#[contractimpl]
impl CrowdfundContract {
    /// Initializes a new crowdfunding campaign.
    ///
    /// # Arguments
    /// * `creator`          – The campaign creator's address.
    /// * `token`            – The token contract address used for contributions.
    /// * `goal`             – The funding goal (in the token's smallest unit).
    /// * `deadline`         – The campaign deadline as a ledger timestamp.
    /// * `min_contribution` – The minimum contribution amount.
    /// * `platform_config`  – Optional platform configuration (address and fee in basis points).
    /// * `fee_tiers`        – Optional fee tiers for dynamic fee calculation.
    pub fn initialize(
        env: Env,
        creator: Address,
        token: Address,
        goal: i128,
        deadline: u64,
        min_contribution: i128,
        platform_config: Option<PlatformConfig>,
        fee_tiers: Option<Vec<FeeTier>>,
    ) {
        // Prevent re-initialization.
        if env.storage().instance().has(&DataKey::Creator) {
            panic!("already initialized");
        }

        creator.require_auth();

        // Validate platform fee if provided.
        if let Some(ref config) = platform_config {
            if config.fee_bps > 10_000 {
                panic!("platform fee cannot exceed 100%");
            }
        }

        // Validate and store fee tiers if provided.
        if let Some(ref tiers) = fee_tiers {
            if !tiers.is_empty() {
                // Validate each tier's fee_bps.
                for tier in tiers.iter() {
                    if tier.fee_bps > 10_000 {
                        panic!("fee tier fee_bps cannot exceed 10000");
                    }
                }

                // Validate tiers are ordered by threshold ascending.
                for i in 1..tiers.len() {
                    let prev = tiers.get(i - 1).unwrap();
                    let curr = tiers.get(i).unwrap();
                    if curr.threshold <= prev.threshold {
                        panic!("fee tiers must be ordered by threshold ascending");
                    }
                }

                env.storage().instance().set(&DataKey::FeeTiers, tiers);
            }
        }

        env.storage().instance().set(&DataKey::Creator, &creator);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::Goal, &goal);
        env.storage().instance().set(&DataKey::Deadline, &deadline);
        env.storage().instance().set(&DataKey::MinContribution, &min_contribution);
        env.storage().instance().set(&DataKey::TotalRaised, &0i128);
        env.storage().instance().set(&DataKey::Status, &Status::Active);

        // Store platform config if provided.
        if let Some(config) = platform_config {
            env.storage().instance().set(&DataKey::PlatformConfig, &config);
        }

        let empty_contributors: Vec<Address> = Vec::new(&env);
        env.storage()
            .instance()
            .set(&DataKey::Contributors, &empty_contributors);
    }

    /// Contribute tokens to the campaign.
    ///
    /// The contributor must authorize the call. Contributions are rejected
    /// after the deadline has passed.
    pub fn contribute(env: Env, contributor: Address, amount: i128) {
        contributor.require_auth();

        let min_contribution: i128 = env.storage().instance().get(&DataKey::MinContribution).unwrap();
        if amount < min_contribution {
            panic!("amount below minimum");
        }

        let deadline: u64 = env.storage().instance().get(&DataKey::Deadline).unwrap();
        if env.ledger().timestamp() > deadline {
            panic!("campaign has ended");
        }

        let token_address: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let token_client = token::Client::new(&env, &token_address);

        // Transfer tokens from the contributor to this contract.
        token_client.transfer(
            &contributor,
            &env.current_contract_address(),
            &amount,
        );

        // Update the contributor's running total.
        let prev: i128 = env
            .storage()
            .instance()
            .get(&DataKey::Contribution(contributor.clone()))
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::Contribution(contributor.clone()), &(prev + amount));

        // Update the global total raised.
        let total: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalRaised)
            .unwrap();
        env.storage()
            .instance()
            .set(&DataKey::TotalRaised, &(total + amount));

        // Track contributor address if new.
        let mut contributors: Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::Contributors)
            .unwrap();
        if !contributors.contains(&contributor) {
            contributors.push_back(contributor);
            env.storage()
                .instance()
                .set(&DataKey::Contributors, &contributors);
        }
    }

    /// Withdraw raised funds — only callable by the creator after the
    /// deadline, and only if the goal has been met.
    pub fn withdraw(env: Env) {
        let status: Status = env.storage().instance().get(&DataKey::Status).unwrap();
        if status != Status::Active {
            panic!("campaign is not active");
        }

        let creator: Address = env.storage().instance().get(&DataKey::Creator).unwrap();
        creator.require_auth();

        let deadline: u64 = env.storage().instance().get(&DataKey::Deadline).unwrap();
        if env.ledger().timestamp() <= deadline {
            panic!("campaign is still active");
        }

        let goal: i128 = env.storage().instance().get(&DataKey::Goal).unwrap();
        let total: i128 = env.storage().instance().get(&DataKey::TotalRaised).unwrap();
        if total < goal {
            panic!("goal not reached");
        }

        let token_address: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let token_client = token::Client::new(&env, &token_address);

        // Calculate and transfer platform fee if configured.
        let platform_config: Option<PlatformConfig> = env.storage().instance().get(&DataKey::PlatformConfig);
        let fee_tiers: Option<Vec<FeeTier>> = env.storage().instance().get(&DataKey::FeeTiers);

        let creator_payout = if let Some(config) = platform_config {
            let fee = if let Some(tiers) = fee_tiers {
                // Use tiered fee calculation.
                Self::calculate_tiered_fee(&env, total, &tiers)
            } else {
                // Fall back to flat fee.
                total * config.fee_bps as i128 / 10_000
            };

            // Transfer fee to platform.
            token_client.transfer(&env.current_contract_address(), &config.address, &fee);

            total - fee
        } else {
            total
        };

        token_client.transfer(&env.current_contract_address(), &creator, &creator_payout);

        env.storage().instance().set(&DataKey::TotalRaised, &0i128);
        env.storage().instance().set(&DataKey::Status, &Status::Successful);
    }

    /// Calculate tiered fee based on total raised and fee tiers.
    fn calculate_tiered_fee(_env: &Env, total: i128, tiers: &Vec<FeeTier>) -> i128 {
        let mut fee = 0i128;
        let mut prev_threshold = 0i128;

        for tier in tiers.iter() {
            if total <= prev_threshold {
                break;
            }

            let portion_end = if total < tier.threshold { total } else { tier.threshold };
            let portion = portion_end - prev_threshold;
            let portion_fee = portion * tier.fee_bps as i128 / 10_000;

            fee += portion_fee;
            prev_threshold = tier.threshold;
        }

        // Apply the last tier's rate to any amount above the highest threshold.
        if total > prev_threshold && !tiers.is_empty() {
            let last_tier = tiers.get(tiers.len() - 1).unwrap();
            let remaining = total - prev_threshold;
            let remaining_fee = remaining * last_tier.fee_bps as i128 / 10_000;
            fee += remaining_fee;
        }

        fee
    }

    /// Refund all contributors — callable by anyone after the deadline
    /// if the goal was **not** met.
    pub fn refund(env: Env) {
        let status: Status = env.storage().instance().get(&DataKey::Status).unwrap();
        if status != Status::Active {
            panic!("campaign is not active");
        }

        let deadline: u64 = env.storage().instance().get(&DataKey::Deadline).unwrap();
        if env.ledger().timestamp() <= deadline {
            panic!("campaign is still active");
        }

        let goal: i128 = env.storage().instance().get(&DataKey::Goal).unwrap();
        let total: i128 = env.storage().instance().get(&DataKey::TotalRaised).unwrap();
        if total >= goal {
            panic!("goal was reached; use withdraw instead");
        }

        let token_address: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let token_client = token::Client::new(&env, &token_address);

        let contributors: Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::Contributors)
            .unwrap();

        for contributor in contributors.iter() {
            let amount: i128 = env
                .storage()
                .instance()
                .get(&DataKey::Contribution(contributor.clone()))
                .unwrap_or(0);
            if amount > 0 {
                token_client.transfer(
                    &env.current_contract_address(),
                    &contributor,
                    &amount,
                );
                env.storage()
                    .instance()
                    .set(&DataKey::Contribution(contributor), &0i128);
            }
        }

        env.storage().instance().set(&DataKey::TotalRaised, &0i128);
        env.storage().instance().set(&DataKey::Status, &Status::Refunded);
    }

    /// Cancel the campaign and refund all contributors — callable only by
    /// the creator while the campaign is still Active.
    pub fn cancel(env: Env) {
        let status: Status = env.storage().instance().get(&DataKey::Status).unwrap();
        if status != Status::Active {
            panic!("campaign is not active");
        }

        let creator: Address = env.storage().instance().get(&DataKey::Creator).unwrap();
        creator.require_auth();

        let token_address: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let token_client = token::Client::new(&env, &token_address);

        let contributors: Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::Contributors)
            .unwrap();

        for contributor in contributors.iter() {
            let amount: i128 = env
                .storage()
                .instance()
                .get(&DataKey::Contribution(contributor.clone()))
                .unwrap_or(0);
            if amount > 0 {
                token_client.transfer(
                    &env.current_contract_address(),
                    &contributor,
                    &amount,
                );
                env.storage()
                    .instance()
                    .set(&DataKey::Contribution(contributor), &0i128);
            }
        }

        env.storage().instance().set(&DataKey::TotalRaised, &0i128);
        env.storage().instance().set(&DataKey::Status, &Status::Cancelled);
    }

    // ── View helpers ────────────────────────────────────────────────────

    /// Returns the total amount raised so far.
    pub fn total_raised(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::TotalRaised)
            .unwrap_or(0)
    }

    /// Returns the funding goal.
    pub fn goal(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::Goal).unwrap()
    }

    /// Returns the campaign deadline.
    pub fn deadline(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::Deadline).unwrap()
    }

    /// Returns the contribution of a specific address.
    pub fn contribution(env: Env, contributor: Address) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::Contribution(contributor))
            .unwrap_or(0)
    }

    /// Returns the minimum contribution amount.
    pub fn min_contribution(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::MinContribution).unwrap()
    }

    /// Returns comprehensive campaign statistics.
    pub fn get_stats(env: Env) -> CampaignStats {
        let total_raised: i128 = env.storage().instance().get(&DataKey::TotalRaised).unwrap_or(0);
        let goal: i128 = env.storage().instance().get(&DataKey::Goal).unwrap();
        let contributors: Vec<Address> = env.storage().instance().get(&DataKey::Contributors).unwrap();

        let progress_bps = if goal > 0 {
            let raw = (total_raised as i128 * 10_000) / goal;
            if raw > 10_000 { 10_000 } else { raw as u32 }
        } else {
            0
        };

        let contributor_count = contributors.len();
        let (average_contribution, largest_contribution) = if contributor_count == 0 {
            (0, 0)
        } else {
            let average = total_raised / contributor_count as i128;
            let mut largest = 0i128;
            for contributor in contributors.iter() {
                let amount: i128 = env.storage().instance().get(&DataKey::Contribution(contributor)).unwrap_or(0);
                if amount > largest {
                    largest = amount;
                }
            }
            (average, largest)
        };

        CampaignStats {
            total_raised,
            goal,
            progress_bps,
            contributor_count,
            average_contribution,
            largest_contribution,
        }
    }

    /// Returns the configured fee tiers.
    pub fn fee_tiers(env: Env) -> Vec<FeeTier> {
        env.storage().instance().get(&DataKey::FeeTiers).unwrap_or_else(|| Vec::new(&env))
    }
}
