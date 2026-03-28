# Lazy Loading Optimization

## Overview

The `lazy_loading_optimization` module provides deferred, on-demand storage reads for the Stellar Raise crowdfund contract. It reduces unnecessary ledger I/O by loading campaign fields only when they are first accessed and caching the result for the remainder of the transaction.

Soroban charges per-entry storage access. Reading every campaign field on every call wastes budget when only a subset of fields is needed. This module solves that with a `LazyField<T>` wrapper and a `CampaignSnapshot` batch-loader.

---

## Files

| File | Purpose |
|---|---|
| `contracts/crowdfund/src/lazy_loading_optimization.rs` | Module implementation |
| `contracts/crowdfund/src/lazy_loading_optimization_test.rs` | Comprehensive test suite |
| `docs/lazy_loading_optimization.md` | This document |

---

## Core Types

### `LazyField<T>`

A generic wrapper that defers a storage read until the value is first requested.

```rust
pub struct LazyField<T: Clone> {
    cached: Option<T>,
}
```

**Methods:**

| Method | Description |
|---|---|
| `new()` / `default()` | Creates an unloaded field |
| `is_loaded()` | Returns `true` after the first access |
| `get_or_default_instance(env, key, default)` | Loads from instance storage or returns `default` |
| `get_or_load_instance(env, key)` | Loads from instance storage, panics if absent |
| `get_or_load_persistent(env, key)` | Loads from persistent storage, panics if absent |

Once loaded, subsequent calls return the cached value without touching storage.

### `CampaignSnapshot`

A batch loader for the four most frequently accessed campaign scalars.

```rust
pub struct CampaignSnapshot {
    pub goal: i128,
    pub total_raised: i128,
    pub deadline: u64,
    pub min_contribution: i128,
}
```

**Constructor:**

```rust
let snap = CampaignSnapshot::load(&env);
```

Reads all four fields in one pass. `total_raised` defaults to `0` if absent; the other three fields panic if absent (contract must be initialized).

**Derived helpers:**

| Method | Returns |
|---|---|
| `progress_bps()` | Progress toward goal in basis points (0–10 000) |
| `goal_met()` | `true` when `total_raised >= goal` |
| `is_expired(env)` | `true` when ledger timestamp > deadline |

---

## Standalone Lazy Helpers

For cases where only a single field is needed:

```rust
lazy_goal(&env, &mut cache)             // -> i128
lazy_total_raised(&env, &mut cache)     // -> i128
lazy_deadline(&env, &mut cache)         // -> u64
lazy_min_contribution(&env, &mut cache) // -> i128
```

Each takes a mutable `LazyField` cache. Pass the same cache across multiple calls within a transaction to avoid redundant reads.

---

## Usage Examples

### Using `CampaignSnapshot`

```rust
use crate::lazy_loading_optimization::CampaignSnapshot;

pub fn check_campaign_status(env: Env) {
    let snap = CampaignSnapshot::load(&env);

    if snap.is_expired(&env) && snap.goal_met() {
        // Campaign succeeded — safe to withdraw
    }

    let progress = snap.progress_bps(); // e.g. 7500 = 75%
}
```

### Using `LazyField` directly

```rust
use crate::lazy_loading_optimization::{LazyField, lazy_goal};

pub fn validate_contribution(env: &Env, amount: i128) {
    let mut goal_cache: LazyField<i128> = LazyField::new();

    // Only reads storage on the first call
    let goal = lazy_goal(env, &mut goal_cache);

    if amount > goal {
        panic!("contribution exceeds goal");
    }
}
```

---

## Security Assumptions

- **Read-only**: This module never writes to storage. All mutations remain in the calling contract functions.
- **Single-read guarantee**: Each `LazyField` reads storage at most once per transaction. The cached value is immutable after loading.
- **Panic on missing required keys**: `get_or_load_instance` and `get_or_load_persistent` panic with a descriptive message if the key is absent. This is intentional — a partially initialized contract must not silently serve stale defaults.
- **No cross-transaction caching**: `LazyField` lives on the stack and is dropped at the end of each contract call. There is no persistent cache that could serve stale data across transactions.

---

## Test Coverage

The test suite in `lazy_loading_optimization_test.rs` covers:

- `LazyField` initial state (`is_loaded` = false)
- Value loading and caching (second call returns cached copy even after storage is overwritten)
- Default fallback when key is absent
- All four standalone lazy helpers (`lazy_goal`, `lazy_total_raised`, `lazy_deadline`, `lazy_min_contribution`)
- `CampaignSnapshot::load` with full and partial seeds
- `progress_bps` at 0%, 50%, 100%, and over 100% (saturation)
- `progress_bps` with zero and negative goal (edge cases)
- `goal_met` below, at, and above goal
- `is_expired` before, at, and after deadline; deadline = 0 edge case

Run the tests with:

```bash
cargo test --package crowdfund lazy_loading_optimization
```
