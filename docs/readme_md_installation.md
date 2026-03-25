# Installation Edge Cases — Stellar Raise Contracts

> Companion to the main [README.md](../README.md).  
> Run `./scripts/verify_env.sh` to check your environment automatically.

---

## Minimum Requirements

| Requirement | Minimum | Notes |
|---|---|---|
| OS | Linux (x86-64) or macOS 12+ | WSL2 on Windows |
| RAM | 4 GB | 8 GB recommended for `--release` builds |
| Disk | 2 GB free | Rust toolchain + WASM target |
| Rust | stable (≥ 1.74) | `rustup update stable` |
| Stellar CLI | ≥ 20.0.0 | Renamed from `soroban` in v20 |
| Node.js | ≥ 18 | For frontend and JS tests |

---

## Edge Case 1 — WASM Target Not Installed

**Symptom**

```
error[E0463]: can't find crate for `std`
  = note: the `wasm32-unknown-unknown` target may not be installed
```

**Fix**

```bash
rustup target add wasm32-unknown-unknown
rustup target list --installed | grep wasm32
```

**Verify**

```bash
cargo build --release --target wasm32-unknown-unknown -p crowdfund
```

---

## Edge Case 2 — Stellar CLI Version / Rename

**Symptom**

```
soroban: command not found
# or
error: unexpected argument '--source-account' found
```

**Background**  
The CLI was renamed from `soroban` to `stellar` in v20. Scripts using `soroban`
will fail on newer installs.

**Fix**

```bash
curl -Ls https://soroban.stellar.org/install-soroban.sh | sh
source ~/.bashrc    # or ~/.zshrc / ~/.profile
stellar --version   # should print stellar-cli x.y.z
```

**Verify**

```bash
stellar contract --help
```

---

## Edge Case 3 — Testnet vs. Futurenet Identity Setup

### Testnet (recommended for development)

Friendbot automatically funds new testnet identities.

```bash
stellar keys generate --global alice --network testnet
stellar keys address alice
# Fund via friendbot (automatic on first use with --network testnet)
```

### Futurenet (pre-release features)

Futurenet requires manual funding and a separate network config.

```bash
stellar network add futurenet \
  --rpc-url https://rpc-futurenet.stellar.org:443 \
  --network-passphrase "Test SDF Future Network ; October 2022"

stellar keys generate --global alice-futurenet --network futurenet
# Fund manually via https://friendbot-futurenet.stellar.org
```

> **Security assumption**: The `.soroban/` directory and `~/.config/stellar/`
> contain **plaintext secret keys**. Never commit them to version control.
> `.soroban/` is already in `.gitignore` — verify with `git check-ignore -v .soroban`.

---

## Edge Case 4 — Toolchain Drift After `rustup update`

After updating Rust, the WASM target may need to be re-added.

```bash
rustup update stable
rustup target add wasm32-unknown-unknown
cargo clean && cargo build --release --target wasm32-unknown-unknown
```

---

## Edge Case 5 — `cargo test` Hangs or Times Out

Soroban tests spin up an in-process ledger. Running many tests in parallel can
exhaust memory on low-RAM machines.

```bash
# Limit parallelism
cargo test --workspace -- --test-threads=2
```

---

## Automated Verification

Run the environment check script before opening a PR or filing a bug report:

```bash
./scripts/verify_env.sh
```

The script checks:
- `rustc`, `cargo`, `stellar` are on `$PATH`
- `wasm32-unknown-unknown` target is installed
- A dry-run build of the crowdfund contract succeeds

Exit codes: `0` = all checks passed, `1` = one or more checks failed.

---

## Security Notes

- Never commit `.soroban/` or `~/.config/stellar/` — they contain secret keys.
- Use a multisig or governance contract as the `admin` for mainnet deployments,
  not a plain keypair (see `docs/admin_upgrade_mechanism.md`).
- Rotate keys immediately if a secret is accidentally pushed to a public repo.
  Use `stellar keys remove <name>` and generate a new identity.
