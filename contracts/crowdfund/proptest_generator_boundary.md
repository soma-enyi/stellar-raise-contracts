# proptest_generator_boundary

Updates for proptest generator boundary conditions focused on gas efficiency and scalability.

## Scope

- `contracts/crowdfund/src/proptest_generator_boundary.rs`
- `contracts/crowdfund/src/proptest_generator_boundary.test.rs`

## Changes implemented

- Added explicit generator/runtime bounds:
  - `PROPTEST_CASES_MIN = 32`
  - `PROPTEST_CASES_MAX = 256`
  - `GENERATOR_BATCH_MAX = 512`
- Added helper functions:
  - `clamp_proptest_cases(requested: u32) -> u32`
  - `is_valid_generator_batch_size(size: u32) -> bool`
  - `boundary_log_tag() -> &'static str`
- Preserved and extended existing boundary helpers for deadline, goal,
  contribution, and progress-bps clamping.
- Added comprehensive property and edge tests in
  `proptest_generator_boundary.test.rs`.

## Security assumptions

- Bounded case counts reduce worst-case resource usage in property tests.
- Bounded generator batch size prevents accidental stress scenarios that can
  mimic gas exhaustion patterns.
- Progress bps remains capped at `10_000`, preventing over-100% reporting.
- Deadline and goal bounds reject malformed/unsafe test inputs early.

## NatSpec-style intent

- Added `@notice` comments on key property tests to clarify guarantees.
- Added `@dev` comments on runtime-bound helpers to document gas-safety intent.

## Test execution

```bash
cargo test --package crowdfund proptest_generator_boundary_tests
```

## Test output summary

- Expectation: all proptest boundary tests pass.
- Includes fuzz/property checks for valid/invalid ranges and clamp behavior.
