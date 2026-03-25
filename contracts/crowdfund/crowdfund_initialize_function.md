# crowdfund_initialize_function

Maintainability-focused extraction for `initialize()` validation and persistence.

## What changed

- Added `contracts/crowdfund/src/crowdfund_initialize_function.rs`.
- Moved `initialize()` validation concerns into:
  - `validate_initialize_inputs(...)`
  - `persist_initialize_state(...)`
- Added focused tests in `contracts/crowdfund/src/crowdfund_initialize_function.test.rs`.

## Security assumptions and guarantees

- `creator.require_auth()` remains enforced in `initialize()`.
- `goal > 0` and `min_contribution > 0` are now explicit guards.
- Platform fee guard remains capped at `10_000` bps (100%).
- Bonus goal must remain strictly greater than primary goal.
- Bonus-goal description still passes bounded length validation.

## Test coverage highlights

- Rejects zero goal.
- Rejects zero minimum contribution.
- Rejects platform fee > 100%.
- Rejects bonus goal `<= goal`.
- Verifies expected persisted state for successful initialization.

## Test command

```bash
cargo test --package crowdfund crowdfund_initialize_function_test
```

## Notes

- This refactor keeps behavior compatible while making initialization logic easier
  to review and audit.
