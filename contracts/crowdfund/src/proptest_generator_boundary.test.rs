//! Comprehensive tests for proptest generator boundary conditions.
//!
//! Ensures boundary constants and validators behave correctly for frontend UI
//! display and property-based test stability.

use proptest::prelude::*;
use proptest::strategy::Just;

use crate::proptest_generator_boundary::{
    boundary_log_tag, clamp_progress_bps, clamp_proptest_cases, is_valid_contribution_amount,
    is_valid_deadline_offset, is_valid_generator_batch_size, is_valid_goal,
    is_valid_min_contribution, DEADLINE_OFFSET_MAX, DEADLINE_OFFSET_MIN, FEE_BPS_CAP,
    GENERATOR_BATCH_MAX, GOAL_MAX, GOAL_MIN, MIN_CONTRIBUTION_FLOOR, PROGRESS_BPS_CAP,
    PROPTEST_CASES_MAX, PROPTEST_CASES_MIN,
};

fn valid_deadline_offset_strategy() -> impl Strategy<Value = u64> {
    DEADLINE_OFFSET_MIN..=DEADLINE_OFFSET_MAX
}

fn valid_goal_strategy() -> impl Strategy<Value = i128> {
    GOAL_MIN..=GOAL_MAX
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(256))]

    /// @notice Valid deadline offsets are always accepted.
    #[test]
    fn prop_valid_deadline_offset_accepted(offset in valid_deadline_offset_strategy()) {
        prop_assert!(is_valid_deadline_offset(offset));
    }

    /// @notice Goals inside allowed range are accepted.
    #[test]
    fn prop_valid_goal_accepted(goal in valid_goal_strategy()) {
        prop_assert!(is_valid_goal(goal));
    }

    /// @notice Offsets below minimum are rejected.
    #[test]
    fn prop_deadline_offset_below_min_rejected(offset in 0u64..DEADLINE_OFFSET_MIN) {
        prop_assert!(!is_valid_deadline_offset(offset));
    }

    /// @notice Offsets above max are rejected.
    #[test]
    fn prop_deadline_offset_above_max_rejected(
        offset in (DEADLINE_OFFSET_MAX + 1)..=(DEADLINE_OFFSET_MAX + 100_000),
    ) {
        prop_assert!(!is_valid_deadline_offset(offset));
    }

    /// @notice Goals below min are rejected.
    #[test]
    fn prop_goal_below_min_rejected(goal in (-1_000_000i128..GOAL_MIN)) {
        prop_assert!(!is_valid_goal(goal));
    }

    /// @notice Goals above max are rejected.
    #[test]
    fn prop_goal_above_max_rejected(goal in (GOAL_MAX + 1)..=(GOAL_MAX + 1_000_000)) {
        prop_assert!(!is_valid_goal(goal));
    }

    /// @notice Min contribution in [floor, goal] is always valid.
    #[test]
    fn prop_min_contribution_valid_for_goal(
        (goal, min) in (GOAL_MIN..=GOAL_MAX)
            .prop_flat_map(|g| (Just(g), MIN_CONTRIBUTION_FLOOR..=g)),
    ) {
        prop_assert!(is_valid_min_contribution(min, goal));
    }

    /// @notice Contributions >= min contribution are valid.
    #[test]
    fn prop_contribution_at_or_above_min_valid(
        (min_contribution, amount) in (MIN_CONTRIBUTION_FLOOR..=1_000_000i128)
            .prop_flat_map(|m| (Just(m), m..=(m + 10_000_000))),
    ) {
        prop_assert!(is_valid_contribution_amount(amount, min_contribution));
    }

    /// @notice Progress bps clamp never exceeds 10_000.
    #[test]
    fn prop_clamp_progress_bps_capped(raw in -1000i128..=20000i128) {
        let clamped = clamp_progress_bps(raw);
        prop_assert!(clamped <= PROGRESS_BPS_CAP);
    }

    /// @notice Case clamp always remains within gas-safe bounds.
    #[test]
    fn prop_clamp_proptest_cases_is_bounded(requested in 0u32..=10_000u32) {
        let cases = clamp_proptest_cases(requested);
        prop_assert!(cases >= PROPTEST_CASES_MIN);
        prop_assert!(cases <= PROPTEST_CASES_MAX);
    }

    /// @notice Batch-size validator matches expected range.
    #[test]
    fn prop_generator_batch_size_matches_range(size in 0u32..=1_024u32) {
        let expected = size >= 1 && size <= GENERATOR_BATCH_MAX;
        prop_assert_eq!(is_valid_generator_batch_size(size), expected);
    }
}

#[cfg(test)]
mod edge_case_tests {
    use super::*;

    #[test]
    fn boundary_100_rejected_typo_fix() {
        assert!(!is_valid_deadline_offset(100));
    }

    #[test]
    fn boundary_1000_accepted() {
        assert!(is_valid_deadline_offset(1000));
    }

    #[test]
    fn fee_bps_cap_is_10000() {
        assert_eq!(FEE_BPS_CAP, 10_000);
    }

    #[test]
    fn progress_bps_cap_is_10000() {
        assert_eq!(PROGRESS_BPS_CAP, 10_000);
    }

    #[test]
    fn proptest_case_bounds_are_stable() {
        assert_eq!(PROPTEST_CASES_MIN, 32);
        assert_eq!(PROPTEST_CASES_MAX, 256);
    }

    #[test]
    fn boundary_log_tag_is_expected() {
        assert_eq!(boundary_log_tag(), "proptest_boundary");
    }
}

