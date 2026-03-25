# Contract State Size Limits

## Overview

The `contract_state_size` module enforces upper-bound limits on every
unbounded collection and user-supplied string stored in the crowdfund
contract's ledger state.

Without these limits an adversary could:

- Flood the `Contributors` or `Pledgers` list until `withdraw` / `refund` /
  `collect_pledges` iterations exceed Soroban's per-transaction resource budget.
- Supply oversized `String` values that push a ledger entry past the host's
  hard serialisation cap, causing a host panic.

---

## Limits

| Constant            | Value | Applies to                                    |
|---------------------|-------|-----------------------------------------------|
| `MAX_CONTRIBUTORS`  | 1 000 | `Contributors` list (contribute), `Pledgers` list (pledge) |
| `MAX_ROADMAP_ITEMS` |    20 | `Roadmap` list (add_roadmap_item)             |
| `MAX_STRETCH_GOALS` |    10 | `StretchGoals` list (add_stretch_goal)        |
| `MAX_STRING_LEN`    |   256 | title, description, social links, roadmap description |

### Rationale

**`MAX_CONTRIBUTORS = 1 000`**  
The `withdraw` function iterates over every contributor to mint NFT rewards
(capped at `MAX_NFT_MINT_BATCH = 50` per call), and `refund` iterates the
full list in one transaction. Keeping the list at ≤ 1 000 entries ensures
both operations stay within Soroban's instruction budget even before the
batch cap kicks in.

**`MAX_ROADMAP_ITEMS = 20`**  
The roadmap is stored in instance storage (loaded on every invocation).
Twenty items is generous for a campaign roadmap while keeping the instance
entry well below the ledger entry size limit.

**`MAX_STRETCH_GOALS = 10`**  
Stretch goals are also in instance storage and iterated in
`current_milestone`. Ten entries is more than sufficient for any realistic
campaign.

**`MAX_STRING_LEN = 256`**  
Soroban's ledger entry size limit is 64 KiB. A single 256-byte string field
is negligible, but without a cap a malicious creator could supply a 60 KiB
description and exhaust the entry budget for other fields.

---

## Error Codes

| Variant                    | Code | Meaning                                  |
|----------------------------|------|------------------------------------------|
| `ContributorLimitExceeded` |  100 | Contributors / pledgers list is full     |
| `RoadmapLimitExceeded`     |  101 | Roadmap list is full                     |
| `StretchGoalLimitExceeded` |  102 | Stretch-goals list is full               |
| `StringTooLong`            |  103 | A string field exceeds 256 bytes         |

Error codes start at 100 to avoid collisions with `ContractError` (1–7).

---

## Integration Points

The guards are called inside the contract methods **before** any state
mutation (checks-before-effects):

| Contract method    | Guard called                    |
|--------------------|---------------------------------|
| `contribute`       | `check_contributor_limit`       |
| `pledge`           | `check_pledger_limit`           |
| `add_roadmap_item` | `check_string_len`, `check_roadmap_limit` |
| `add_stretch_goal` | `check_stretch_goal_limit`      |

---

## Security Assumptions

1. Limits are enforced on every write path; read paths are unaffected.
2. Existing entries that pre-date this module are not retroactively removed.
   If a list already exceeds a limit (e.g. after a migration), new entries
   are still rejected.
3. Limits can only be changed via a contract upgrade (admin-only).
4. The `StateSizeError` discriminants are stable across upgrades; do not
   renumber them.

---

## Testing

Run the unit tests with:

```bash
cargo test --package crowdfund contract_state_size
```

The test suite (`contract_state_size_test.rs`) covers:

- Empty-list baseline (all helpers return `Ok`).
- One-below-limit (returns `Ok`).
- Exactly-at-limit (returns the correct `Err` variant).
- Over-limit (returns the correct `Err` variant).
- String boundary: at `MAX_STRING_LEN` → `Ok`; at `MAX_STRING_LEN + 1` → `Err`.
- Error discriminant stability.
