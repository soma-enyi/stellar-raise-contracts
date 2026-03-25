# proptest_generator_boundary

Refactored proptest generator boundary conditions for the Stellar Raise
crowdfund contract. This module is the single source of truth for all boundary
constants and validation helpers consumed by property-based tests.

---

## Scope

| File | Role |
|------|------|
| `contracts/crowdfund/src/proptest_generator_boundary.rs` | Constants, validators, clamping helpers, derived helpers |
| `contracts/crowdfund/src/proptest_generator_boundary.test.rs` | Property tests (256 cases each) + edge-case/regression tests |

---

## Typo Fix: Deadline Offset Minimum

**Issue**: The minimum deadline offset was previously documented as **100 seconds**, which:

- Caused proptest regression failures (see `proptest-regressions/test.txt`).
- Produced flaky tests due to timing races in CI.
- Led to poor frontend UX (countdown display flickering for very short campaigns).

**Fix**: The minimum is now **1,000 seconds** (~17 minutes), providing:

- Stable property-based tests with no timing races.
- Meaningful campaign duration for UI display.
- Consistent behavior across CI and local runs.

---

## Boundary Constants

| Constant | Value | Rationale |
|----------|-------|-----------|
| `DEADLINE_OFFSET_MIN` | 1,000 | ~17 min; prevents flaky tests and meaningless campaigns |
| `DEADLINE_OFFSET_MAX` | 1,000,000 | ~11.5 days; avoids u64 overflow on ledger timestamps |
| `GOAL_MIN` | 1,000 | Prevents division-by-zero in `progress_bps` display |
| `GOAL_MAX` | 100,000,000 | 10 XLM; keeps tests fast, covers large campaigns |
| `MIN_CONTRIBUTION_FLOOR` | 1 | Prevents zero-value contributions polluting ledger state |
| `PROGRESS_BPS_CAP` | 10,000 | 100 %; frontend never shows >100 % funded |
| `FEE_BPS_CAP` | 10,000 | 100 %; fee above this would exceed the contribution |
| `PROPTEST_CASES_MIN` | 32 | Below this, boundary-adjacent values are rarely sampled |
| `PROPTEST_CASES_MAX` | 256 | Balances coverage with CI execution time |
| `GENERATOR_BATCH_MAX` | 512 | Prevents worst-case memory/gas spikes in test scaffolds |

---

## Validation Functions

### `is_valid_deadline_offset(offset: u64) -> bool`

Returns `true` if `offset ∈ [DEADLINE_OFFSET_MIN, DEADLINE_OFFSET_MAX]`.

@notice Rejects values that cause timestamp overflow or campaigns too short
        for meaningful frontend display.

### `is_valid_goal(goal: i128) -> bool`

Returns `true` if `goal ∈ [GOAL_MIN, GOAL_MAX]`.

@notice Rejects zero and negative goals to prevent division-by-zero in
        progress calculations.

### `is_valid_min_contribution(min_contribution: i128, goal: i128) -> bool`

Returns `true` if `min_contribution ∈ [MIN_CONTRIBUTION_FLOOR, goal]`.

@notice `min_contribution > goal` would make it impossible to contribute.

### `is_valid_contribution_amount(amount: i128, min_contribution: i128) -> bool`

Returns `true` if `amount >= min_contribution`.

### `is_valid_fee_bps(fee_bps: u32) -> bool`

Returns `true` if `fee_bps <= FEE_BPS_CAP`.

@notice A fee above 10,000 bps would exceed 100 % of the contribution.

---

## Clamping Helpers

### `clamp_progress_bps(raw: i128) -> u32`

Clamps raw progress to `[0, PROGRESS_BPS_CAP]`.

@dev Negative values floor to 0. Values above 10,000 cap at 10,000.
     Ensures the frontend never displays >100 % funded.

### `clamp_proptest_cases(requested: u32) -> u32`

Clamps requested case count to `[PROPTEST_CASES_MIN, PROPTEST_CASES_MAX]`.

@dev Protects CI runtime cost while preserving boundary signal.

---

## Derived Helpers

### `compute_progress_bps(raised: i128, goal: i128) -> u32`

Computes `(raised * 10_000) / goal`, clamped to `[0, PROGRESS_BPS_CAP]`.
Returns 0 when `goal <= 0` to avoid division-by-zero.

### `compute_fee_amount(amount: i128, fee_bps: u32) -> i128`

Computes `amount * fee_bps / 10_000` (integer floor).
Returns 0 when `amount <= 0` or `fee_bps == 0`.

---

## Security Assumptions

1. **Overflow**: Goals and contributions are bounded to reduce integer overflow
   risk. `compute_progress_bps` uses `saturating_mul` for safety.
2. **Division by zero**: `goal > 0` is enforced before any division.
3. **Timestamp validity**: Deadline offsets exclude past and unreasonably large
   values, preventing timestamp overflow when added to ledger time.
4. **Basis points**: `progress_bps` and `fee_bps` are capped at 10,000 (100 %)
   to prevent display errors and economic exploits.
5. **Test resource bounds**: `PROPTEST_CASES_MAX` and `GENERATOR_BATCH_MAX`
   prevent accidental stress scenarios that mimic gas exhaustion patterns.

---

## NatSpec-Style Comments

All exported functions carry `@notice` (user-facing guarantee) and `@dev`
(implementation detail) comments in the source. Key examples:

```rust
/// @notice Clamps raw progress basis points to [0, PROGRESS_BPS_CAP].
/// @dev Negative raw values are floored to 0. Values above 10_000 are
///      capped so the frontend never shows >100 %.
pub fn clamp_progress_bps(raw: i128) -> u32 { ... }
```

---

## Regression Seeds

The following seeds motivated the boundary fixes:

| Seed | Old behaviour | New behaviour |
|------|---------------|---------------|
| `goal=1_000_000, deadline=100` | Flaky (100 accepted) | Rejected (100 < 1_000) |
| `goal=2_000_000, deadline=100, contribution=100_000` | Flaky | Rejected |

---

## Test Execution

```bash
# Run all boundary tests (unit + property + edge-case)
cargo test --package crowdfund proptest_generator_boundary

# Run only the property tests
cargo test --package crowdfund prop_

# Run with increased case count
PROPTEST_CASES=512 cargo test --package crowdfund proptest_generator_boundary
```

---

## Test Coverage Summary

| Category | Tests |
|----------|-------|
| Constant sanity checks | 10 |
| `is_valid_deadline_offset` | 4 unit + 3 property |
| `is_valid_goal` | 4 unit + 3 property |
| `is_valid_min_contribution` | 4 unit + 2 property |
| `is_valid_contribution_amount` | 3 unit + 2 property |
| `is_valid_fee_bps` | 3 unit + 2 property |
| `clamp_progress_bps` | 5 unit + 4 property |
| `clamp_proptest_cases` | 3 unit + 2 property |
| `is_valid_generator_batch_size` | 4 unit + 3 property |
| `compute_progress_bps` | 6 unit + 3 property |
| `compute_fee_amount` | 5 unit + 3 property |
| `boundary_log_tag` | 2 unit |
| Regression seeds | 4 |
| Constant stability | 1 |

Target: ≥ 95 % line coverage.

---

## References

- [Proptest Book](https://altsysrq.github.io/proptest-book/)
- [Soroban Testing](https://soroban.stellar.org/docs/learn/testing)
- Contract: `contracts/crowdfund/src/lib.rs`
- Regression seeds: `contracts/crowdfund/proptest-regressions/test.txt`
