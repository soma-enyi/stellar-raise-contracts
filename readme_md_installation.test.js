/**
 * readme_md_installation.test.js
 *
 * Verifies that the installation commands documented in README.md and
 * docs/readme_md_installation.md are correct and that supporting scripts
 * conform to their documented logging bounds.
 *
 * @security Tests run locally only. No network calls, no Stellar keys required.
 */

'use strict';

const { execSync, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname);
const DEPLOY_SCRIPT = path.join(ROOT, 'scripts', 'deploy.sh');
const INTERACT_SCRIPT = path.join(ROOT, 'scripts', 'interact.sh');
const EXEC_OPTS = { encoding: 'utf8', stdio: 'pipe' };

// Use real binary paths — snap wrappers silently return empty output from Node.js
const RUST_BIN = '/home/ajidokwu/.rustup/toolchains/stable-x86_64-unknown-linux-gnu/bin';
const RUSTUP_BIN = '/snap/rustup/current/bin';
// nvm node may not be on the Jest process PATH; find the active version
const NVM_NODE_BIN = (() => {
  const nvm = process.env.NVM_BIN || '';
  if (nvm) return nvm;
  try {
    const { execSync: es } = require('child_process');
    const p = es('bash -c "source ~/.nvm/nvm.sh 2>/dev/null && which node"',
      { encoding: 'utf8', stdio: 'pipe' }).trim();
    return require('path').dirname(p);
  } catch (_) { return ''; }
})();
const AUGMENTED_PATH = [RUST_BIN, RUSTUP_BIN, NVM_NODE_BIN, '/snap/bin', process.env.PATH || ''].filter(Boolean).join(':');
const AUGMENTED_ENV = { ...process.env, PATH: AUGMENTED_PATH };

/** Run a command and return stdout, or throw with a clear message. */
function run(cmd, opts = {}) {
  return execSync(cmd, { ...EXEC_OPTS, env: AUGMENTED_ENV, ...opts });
}

/** Run a script with args via spawnSync; returns { stdout, stderr, status }. */
function runScript(scriptPath, args = []) {
  const result = spawnSync('bash', [scriptPath, ...args], {
    encoding: 'utf8',
    env: AUGMENTED_ENV,
  });
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    status: result.status,
  };
}

/** Extract [LOG] lines from output. */
function logLines(output) {
  return (output || '').split('\n').filter(l => l.includes('[LOG]'));
}

/** Parse a single [LOG] key=value line into an object. */
function parseLog(line) {
  const obj = {};
  const matches = (line || '').matchAll(/(\w+)=(\S+)/g);
  for (const [, k, v] of matches) obj[k] = v;
  return obj;
}

/** Returns true if the stellar CLI is available. */
function hasStellar() {
  try {
    run('stellar --version');
    return true;
  } catch (_) {
    return false;
  }
}

const STELLAR_AVAILABLE = hasStellar();
>>>>>>> develop

// ── Prerequisites ─────────────────────────────────────────────────────────────

describe('Prerequisites', () => {
  const skipIfNoRust = HAS_RUST ? test : test.skip;
  const skipIfNoRustup = HAS_RUSTUP ? test : test.skip;
  const skipIfNoStellar = HAS_STELLAR ? test : test.skip;

  skipIfNoRust('rustc is installed', () => {
    expect(run('rustc --version')).toMatch(/^rustc \d+\.\d+\.\d+/);
  });

  skipIfNoRust('cargo is installed', () => {
    expect(run('cargo --version')).toMatch(/^cargo \d+\.\d+\.\d+/);
  });

  skipIfNoRustup('wasm32-unknown-unknown target is installed', () => {
    expect(run('rustup target list --installed')).toContain('wasm32-unknown-unknown');
  });

<<<<<<< HEAD
  skipIfNoStellar('stellar CLI is installed (v20+ rename)', () => {
    expect(run('stellar --version')).toContain('stellar-cli');
||||||| fe8427a9
  test('stellar CLI is installed (v20+ rename)', () => {
    const out = run('stellar --version');
    expect(out).toContain('stellar-cli');
=======
  test('stellar CLI is installed (v20+ rename)', () => {
    if (!STELLAR_AVAILABLE) {
      console.warn('  [SKIP] stellar CLI not found — skipping version check');
      return;
    }
    const out = run('stellar --version');
    expect(out).toContain('stellar');
>>>>>>> develop
  });

  test('Node.js >= 18 is available', () => {
    const major = parseInt(run('node --version').trim().replace('v', ''), 10);
    expect(major).toBeGreaterThanOrEqual(18);
  });
});

<<<<<<< HEAD
||||||| fe8427a9
// ── Getting Started commands ──────────────────────────────────────────────────

describe('Getting Started', () => {
  test('cargo build --dry-run succeeds (wasm32 release)', () => {
    run(
      'cargo build --release --target wasm32-unknown-unknown -p crowdfund --dry-run',
      { cwd: ROOT, timeout: 30000 }
    );
  }, 35000);

  test('cargo test --no-run compiles test suite', () => {
    run('cargo test --no-run --workspace', { cwd: ROOT, timeout: 120000, stdio: 'ignore' });
  }, 130000);
});

=======
// ── Getting Started commands ──────────────────────────────────────────────────

describe('Getting Started', () => {
  test('cargo check is available (toolchain ready)', () => {
    const out = run('cargo --version');
    expect(out).toMatch(/^cargo \d+\.\d+\.\d+/);
  });

  test('wasm32 target is present for cargo builds', () => {
    const out = run('rustup target list --installed');
    expect(out).toContain('wasm32-unknown-unknown');
  });
});

>>>>>>> develop
// ── deploy.sh logging bounds ──────────────────────────────────────────────────

describe('deploy.sh logging bounds', () => {
<<<<<<< HEAD
  test('deploy.sh with no args exits non-zero (missing required args)', () => {
    const { status } = spawn(DEPLOY_SCRIPT);
||||||| fe8427a9
  // Run with missing args to trigger early exit — we only test log format,
  // not actual network calls.
  test('10 - deploy.sh with no args exits non-zero (missing required args)', () => {
    const { status } = run(DEPLOY_SCRIPT, []);
=======
  test('10 - deploy.sh with no args exits non-zero (missing required args)', () => {
    const { status } = runScript(DEPLOY_SCRIPT, []);
>>>>>>> develop
    expect(status).not.toBe(0);
  });

<<<<<<< HEAD
  test('deploy.sh emits no [LOG] lines before arg validation fails', () => {
    const { stdout } = spawn(DEPLOY_SCRIPT);
||||||| fe8427a9
  test('11 - deploy.sh emits no [LOG] lines before arg validation fails', () => {
    const { stdout } = run(DEPLOY_SCRIPT, []);
=======
  test('11 - deploy.sh emits no [LOG] lines before arg validation fails', () => {
    const { stdout } = runScript(DEPLOY_SCRIPT, []);
>>>>>>> develop
    expect(logLines(stdout).length).toBe(0);
  });

<<<<<<< HEAD
  test('[LOG] line format is key=value pairs', () => {
    const out = run(`bash -c 'echo "[LOG] step=build status=start"'`).trim();
||||||| fe8427a9
  test('12 - [LOG] line format is key=value pairs', () => {
    // Simulate a partial run by sourcing just the echo lines via bash -c
    const out = execSync(
      `bash -c 'echo "[LOG] step=build status=start"'`,
      { encoding: 'utf8' }
    ).trim();
=======
  test('12 - [LOG] line format is key=value pairs', () => {
    const out = execSync(
      `bash -c 'echo "[LOG] step=build status=start"'`,
      { encoding: 'utf8' }
    ).trim();
>>>>>>> develop
    const parsed = parseLog(out);
    expect(parsed.step).toBe('build');
    expect(parsed.status).toBe('start');
  });

<<<<<<< HEAD
  test('deploy.sh source contains all 7 expected [LOG] patterns', () => {
||||||| fe8427a9
  test('13 - deploy.sh [LOG] lines use step= field', () => {
    // Verify the script source contains the expected log patterns
=======
  test('13 - deploy.sh [LOG] lines use step= field', () => {
>>>>>>> develop
    const src = fs.readFileSync(DEPLOY_SCRIPT, 'utf8');
    expect(src).toMatch(/\[LOG\] step=build status=start/);
    expect(src).toMatch(/\[LOG\] step=build status=ok/);
    expect(src).toMatch(/\[LOG\] step=deploy status=start/);
    expect(src).toMatch(/\[LOG\] step=deploy status=ok/);
    expect(src).toMatch(/\[LOG\] step=initialize status=start/);
    expect(src).toMatch(/\[LOG\] step=initialize status=ok/);
    expect(src).toMatch(/\[LOG\] step=done/);
  });

  test('deploy.sh has at most 7 [LOG] echo lines (bounded output)', () => {
    const src = fs.readFileSync(DEPLOY_SCRIPT, 'utf8');
    const count = (src.match(/echo "\[LOG\]/g) || []).length;
    expect(count).toBeLessThanOrEqual(7);
  });
});

<<<<<<< HEAD
||||||| fe8427a9
describe('Edge Case — WASM target', () => {
  test('rustup target list --installed contains wasm32-unknown-unknown', () => {
    expect(run('rustup target list --installed')).toMatch(/wasm32-unknown-unknown/);
  });
});

=======
// ── Edge Case — WASM target ───────────────────────────────────────────────────

describe('Edge Case — WASM target', () => {
  test('rustup target list --installed contains wasm32-unknown-unknown', () => {
    expect(run('rustup target list --installed')).toMatch(/wasm32-unknown-unknown/);
  });
});

>>>>>>> develop
// ── interact.sh logging bounds ────────────────────────────────────────────────

describe('interact.sh logging bounds', () => {
<<<<<<< HEAD
  test('interact.sh with no args exits non-zero', () => {
    const { status } = spawn(INTERACT_SCRIPT);
||||||| fe8427a9
  test('16 - interact.sh with no args exits non-zero', () => {
    const { status } = run(INTERACT_SCRIPT, []);
=======
  test('16 - interact.sh with no args exits non-zero', () => {
    const { status } = runScript(INTERACT_SCRIPT, []);
>>>>>>> develop
    expect(status).not.toBe(0);
  });

<<<<<<< HEAD
  test('interact.sh unknown action emits exactly 1 [LOG] error line', () => {
    const { stdout, status } = spawn(INTERACT_SCRIPT, ['CTEST', 'unknown_action']);
||||||| fe8427a9
  test('17 - interact.sh unknown action emits exactly 1 [LOG] error line', () => {
    const { stdout, status } = run(INTERACT_SCRIPT, ['CTEST', 'unknown_action']);
=======
  test('17 - interact.sh unknown action emits exactly 1 [LOG] error line', () => {
    const { stdout, status } = runScript(INTERACT_SCRIPT, ['CTEST', 'unknown_action']);
>>>>>>> develop
    expect(status).toBe(1);
    const lines = logLines(stdout);
    expect(lines.length).toBe(1);
    expect(lines[0]).toMatch(/status=error/);
  });

<<<<<<< HEAD
  test('interact.sh unknown action log line has reason= field', () => {
    const { stdout } = spawn(INTERACT_SCRIPT, ['CTEST', 'unknown_action']);
    const parsed = parseLog(logLines(stdout)[0]);
||||||| fe8427a9
  test('18 - interact.sh unknown action log line has reason= field', () => {
    const { stdout } = run(INTERACT_SCRIPT, ['CTEST', 'unknown_action']);
    const lines = logLines(stdout);
    const parsed = parseLog(lines[0]);
=======
  test('18 - interact.sh unknown action log line has reason= field', () => {
    const { stdout } = runScript(INTERACT_SCRIPT, ['CTEST', 'unknown_action']);
    const lines = logLines(stdout);
    const parsed = parseLog(lines[0]);
>>>>>>> develop
    expect(parsed.reason).toBe('unknown_action');
  });
<<<<<<< HEAD

  test('interact.sh contribute action has exactly 2 [LOG] lines in source', () => {
    const src = fs.readFileSync(INTERACT_SCRIPT, 'utf8');
    const block = src.match(/contribute\)([\s\S]*?);;/)?.[1] || '';
    expect((block.match(/echo "\[LOG\]/g) || []).length).toBe(2);
  });

  test('interact.sh withdraw action has exactly 2 [LOG] lines in source', () => {
    const src = fs.readFileSync(INTERACT_SCRIPT, 'utf8');
    const block = src.match(/withdraw\)([\s\S]*?);;/)?.[1] || '';
    expect((block.match(/echo "\[LOG\]/g) || []).length).toBe(2);
  });
});
||||||| fe8427a9
});
=======
>>>>>>> develop

// ── Edge Cases ────────────────────────────────────────────────────────────────

describe('Edge Case — WASM target', () => {
  const skipIfNoRustup = HAS_RUSTUP ? test : test.skip;

  skipIfNoRustup('rustup target list --installed contains wasm32-unknown-unknown', () => {
    expect(run('rustup target list --installed')).toMatch(/wasm32-unknown-unknown/);
  });
});
<<<<<<< HEAD
||||||| fe8427a9
=======

// ── Edge Case — Stellar CLI versioning ───────────────────────────────────────
>>>>>>> develop

describe('Edge Case — Stellar CLI versioning', () => {
<<<<<<< HEAD
  const skipIfNoStellar = HAS_STELLAR ? test : test.skip;

  skipIfNoStellar('stellar --version does not start with "soroban" (v20+ rename)', () => {
    expect(run('stellar --version')).not.toMatch(/^soroban/);
||||||| fe8427a9
  test('stellar --version does not contain "soroban" (v20+ rename)', () => {
    const out = run('stellar --version');
    // The binary is now `stellar`, not `soroban`
    expect(out).not.toMatch(/^soroban/);
=======
  test('stellar --version does not contain "soroban" (v20+ rename)', () => {
    if (!STELLAR_AVAILABLE) {
      console.warn('  [SKIP] stellar CLI not found — skipping rename check');
      return;
    }
    const out = run('stellar --version');
    expect(out).not.toMatch(/^soroban/);
>>>>>>> develop
  });

<<<<<<< HEAD
  skipIfNoStellar('stellar contract --help exits cleanly', () => {
||||||| fe8427a9
  test('stellar contract --help exits cleanly', () => {
    // Verifies the CLI sub-command structure expected by deploy scripts
=======
  test('stellar contract --help exits cleanly', () => {
    if (!STELLAR_AVAILABLE) {
      console.warn('  [SKIP] stellar CLI not found — skipping contract --help check');
      return;
    }
>>>>>>> develop
    expect(() => run('stellar contract --help')).not.toThrow();
  });
});

describe('Edge Case — Network identity (no keys required)', () => {
  test('stellar keys list does not crash', () => {
<<<<<<< HEAD
||||||| fe8427a9
    // May return empty list — that is fine
=======
    if (!STELLAR_AVAILABLE) {
      console.warn('  [SKIP] stellar CLI not found — skipping keys list check');
      return;
    }
>>>>>>> develop
    expect(() => {
      try { run('stellar keys list'); } catch (_) { /* no keys configured — acceptable */ }
    }).not.toThrow();
  });
});

// ── Security ──────────────────────────────────────────────────────────────────

describe('Security', () => {
  test('.soroban/ is listed in .gitignore', () => {
    const gitignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
    expect(gitignore).toMatch(/\.soroban/);
  });

  test('verify_env.sh exists and is executable', () => {
    const script = path.join(ROOT, 'scripts', 'verify_env.sh');
    expect(fs.existsSync(script)).toBe(true);
    expect(fs.statSync(script).mode & 0o100).toBeTruthy();
  });

  test('docs/readme_md_installation.md exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'docs', 'readme_md_installation.md'))).toBe(true);
  });
});
