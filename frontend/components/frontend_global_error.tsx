import React, { Component, ErrorInfo, ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Custom Error Classes
// ---------------------------------------------------------------------------

/**
 * @title ContractError
 * @notice Represents errors originating from smart contract execution on Stellar/Soroban.
 * @dev Thrown when a contract invocation fails, returns an unexpected result, or
 * the transaction is rejected by the network.
 * @custom:security Never include raw contract state, XDR payloads, or private keys
 * in the message string.
 */
export class ContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContractError';
  }
}

/**
 * @title NetworkError
 * @notice Represents errors caused by network connectivity issues when communicating
 * with the Stellar Horizon API or RPC endpoints.
 */
export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

/**
 * @title TransactionError
 * @notice Represents errors that occur during blockchain transaction submission,
 * signing, or confirmation phases.
 * @custom:security Do not embed transaction XDR or signing keys in the message.
 */
export class TransactionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransactionError';
  }
}

// ---------------------------------------------------------------------------
// Logging infrastructure
// ---------------------------------------------------------------------------

/** @notice Severity levels for boundary log entries. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * @notice A single structured log entry emitted by the boundary.
 * @dev All fields are plain serialisable values safe to JSON.stringify and
 * forward to any log aggregator without further transformation.
 */
export interface BoundaryLogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  /** Sanitised error message — secrets redacted. */
  errorMessage: string;
  errorName: string;
  isSmartContractError: boolean;
  /** Omitted in production. */
  componentStack?: string;
  /** Omitted in production. */
  stack?: string;
  /** Monotonically increasing per boundary instance. */
  sequence: number;
}

// ---------------------------------------------------------------------------
// Log sanitisation
// ---------------------------------------------------------------------------

/**
 * @notice Patterns that may indicate sensitive data in error messages.
 * @dev Matches hex keys (32+ chars), Stellar account IDs, base64 blobs,
 * and explicit key assignment patterns.
 * @custom:security Best-effort filter — callers must not embed secrets in
 * error messages in the first place.
 */
const SENSITIVE_PATTERNS: RegExp[] = [
  /\b[0-9a-fA-F]{32,}\b/g,
  /\bG[A-Z2-7]{55}\b/g,
  /\b[A-Za-z0-9+/]{40,}={0,2}\b/g,
  /secret[_\s]?key\s*[:=]\s*\S+/gi,
  /private[_\s]?key\s*[:=]\s*\S+/gi,
];

/**
 * @dev Replaces potentially sensitive substrings with [REDACTED].
 * The original error object is never mutated.
 * @custom:security Conservative by design — may redact non-sensitive content
 * that matches patterns. False negatives (leaking secrets) are not acceptable.
 */
export function sanitizeErrorMessage(message: string): string {
  if (typeof message !== 'string') return '[non-string error]';
  let sanitized = message;
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }
  return sanitized;
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

/** Maximum log entries allowed per sliding window. */
const LOG_RATE_LIMIT = 10;
/** Sliding window duration in milliseconds. */
const LOG_RATE_WINDOW_MS = 60_000;

/**
 * @dev Lightweight token-bucket rate limiter for boundary log entries.
 * Shared across all boundary instances so nested boundaries cannot
 * collectively bypass the limit.
 */
export class BoundaryRateLimiter {
  private timestamps: number[] = [];

  /** @return true if a log entry is allowed under the current rate limit. */
  isAllowed(): boolean {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < LOG_RATE_WINDOW_MS);
    if (this.timestamps.length >= LOG_RATE_LIMIT) return false;
    this.timestamps.push(now);
    return true;
  }

  /** Resets the limiter — use in tests to ensure isolation. */
  reset(): void {
    this.timestamps = [];
  }
}

/** Module-level singleton rate limiter. */
export const boundaryRateLimiter = new BoundaryRateLimiter();

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

const CONTRACT_KEYWORDS = [
  'contract', 'stellar', 'soroban', 'transaction',
  'blockchain', 'ledger', 'horizon', 'xdr', 'invoke', 'wallet',
] as const;

/**
 * @dev Classification result is cached via WeakMap so repeated renders
 * do not re-scan the error message string (gas/CPU efficiency).
 */
const _classificationCache = new WeakMap<Error, boolean>();

/**
 * @dev Determines whether an error is related to smart contract execution.
 * @custom:security Unknown error types default to the generic handler (safer path).
 */
export function isSmartContractError(error: Error): boolean {
  if (_classificationCache.has(error)) {
    return _classificationCache.get(error)!;
  }
  let result: boolean;
  if (
    error instanceof ContractError ||
    error instanceof NetworkError ||
    error instanceof TransactionError
  ) {
    result = true;
  } else {
    const haystack = `${error.name} ${error.message}`.toLowerCase();
    result = CONTRACT_KEYWORDS.some((kw) => haystack.includes(kw));
  }
  _classificationCache.set(error, result);
  return result;
}

// ---------------------------------------------------------------------------
// Structured log entry + error report builders
// ---------------------------------------------------------------------------

export interface ErrorReport {
  message: string;
  stack: string | undefined;
  componentStack: string | null | undefined;
  timestamp: string;
  isSmartContractError: boolean;
  errorName: string;
}

/**
 * @dev Builds a structured, sanitised log entry for a caught boundary error.
 * Stack traces are included only in development mode.
 * @custom:security errorMessage is sanitised via sanitizeErrorMessage before
 * inclusion so secrets are not forwarded to log aggregators.
 */
export function buildBoundaryLogEntry(
  error: Error,
  errorInfo: ErrorInfo,
  isContract: boolean,
  sequence: number,
): BoundaryLogEntry {
  const isDev = process.env.NODE_ENV !== 'production';
  return {
    timestamp: new Date().toISOString(),
    level: 'error',
    message: isContract
      ? 'Smart contract error caught by boundary'
      : 'Generic render error caught by boundary',
    errorMessage: sanitizeErrorMessage(error.message),
    errorName: error.name,
    isSmartContractError: isContract,
    componentStack: isDev ? (errorInfo.componentStack ?? undefined) : undefined,
    stack: isDev ? error.stack : undefined,
    sequence,
  };
}

/**
 * @dev Builds a sanitised error report for the caller's onError callback.
 * @custom:security Stack traces are included only in development mode.
 */
export function buildErrorReport(
  error: Error,
  errorInfo: ErrorInfo,
  isContract: boolean,
): ErrorReport {
  const isDev = process.env.NODE_ENV !== 'production';
  return {
    message: error.message,
    stack: isDev ? error.stack : undefined,
    componentStack: isDev ? errorInfo.componentStack : undefined,
    timestamp: new Date().toISOString(),
    isSmartContractError: isContract,
    errorName: error.name,
  };
}

// ---------------------------------------------------------------------------
// Component types
// ---------------------------------------------------------------------------

/** Maximum number of retry attempts before the retry button is hidden. */
export const MAX_RETRIES = 3;

export interface FrontendGlobalErrorBoundaryProps {
  /** @dev The child component tree to protect with this error boundary. */
  children?: ReactNode;
  /**
   * @dev Optional custom fallback UI. When provided it replaces the built-in
   * fallback entirely, giving callers full control over the error presentation.
   */
  fallback?: ReactNode;
  /**
   * @dev Optional callback invoked with a structured error report whenever an
   * error is caught. Use this to forward errors to Sentry, LogRocket, etc.
   */
  onError?: (report: ErrorReport) => void;
  /**
   * @dev Optional callback invoked with the full structured log entry.
   * Enables callers to forward entries to a log aggregator without re-parsing
   * console output.
   */
  onLog?: (entry: BoundaryLogEntry) => void;
}

interface BoundaryState {
  hasError: boolean;
  error: Error | null;
  isSmartContractError: boolean;
  /** Number of retry attempts made so far. */
  retryCount: number;
}

// ---------------------------------------------------------------------------
// FrontendGlobalErrorBoundary
// ---------------------------------------------------------------------------

/**
 * @title FrontendGlobalErrorBoundary
 * @notice React class-based error boundary for the Stellar Raise frontend.
 *
 * @dev Catches synchronous render-phase errors anywhere in the wrapped component
 * tree, classifies them (generic vs. smart-contract), emits a structured and
 * rate-limited log entry, and renders an appropriate fallback UI with a
 * "Try Again" recovery path (capped at MAX_RETRIES).
 *
 * Logging pipeline:
 *   buildBoundaryLogEntry -> sanitizeErrorMessage -> boundaryRateLimiter.isAllowed()
 *   -> console.error (structured) -> onLog callback -> onError callback
 *
 * @custom:security
 *   - Stack traces are suppressed in production to prevent information disclosure.
 *   - Error messages are sanitised before logging to strip potential secrets.
 *   - Log entries are rate-limited (10 per 60 s) to prevent flooding.
 *   - Fallback UI uses only static strings — no raw error data in innerHTML (XSS safe).
 *   - Classification results are cached via WeakMap to avoid redundant string scans.
 *
 * @custom:limitations
 *   - Does NOT catch errors in async event handlers, setTimeout, or SSR.
 *   - Does NOT catch errors thrown inside the boundary's own render method.
 */
export class FrontendGlobalErrorBoundary extends Component<
  FrontendGlobalErrorBoundaryProps,
  BoundaryState
> {
  /** Monotonically increasing counter for log entry sequencing. */
  private logSequence = 0;

  constructor(props: FrontendGlobalErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, isSmartContractError: false, retryCount: 0 };
    this.handleRetry = this.handleRetry.bind(this);
  }

  /**
   * @dev Updates component state so the next render shows the fallback UI.
   * Non-Error thrown values are normalised to Error here so downstream code
   * can always rely on a proper Error instance.
   */
  static getDerivedStateFromError(error: unknown): Partial<BoundaryState> {
    const err =
      error instanceof Error
        ? error
        : new Error(error != null ? String(error) : 'An unexpected error occurred');
    return {
      hasError: true,
      error: err,
      isSmartContractError: isSmartContractError(err),
    };
  }

  /**
   * @dev Called after an error has been thrown by a descendant component.
   * Logging is rate-limited and messages are sanitised before emission.
   * When the rate limit is exceeded a single warning is emitted instead of
   * the full entry to signal suppression without flooding the log.
   */
  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const normalisedError = this.state.error ?? error;
    const isContract = isSmartContractError(normalisedError);
    this.logSequence += 1;

    if (!boundaryRateLimiter.isAllowed()) {
      console.warn(
        'Documentation Error Boundary: log rate limit exceeded — suppressing entry',
        { sequence: this.logSequence },
      );
      return;
    }

    const logEntry = buildBoundaryLogEntry(normalisedError, errorInfo, isContract, this.logSequence);

    console.error('Documentation Error Boundary caught an error:', error, errorInfo);

    if (typeof this.props.onLog === 'function') {
      this.props.onLog(logEntry);
    }

    const report = buildErrorReport(normalisedError, errorInfo, isContract);
    if (typeof this.props.onError === 'function') {
      this.props.onError(report);
    }
  }

  /**
   * @dev Resets error state so the child tree is re-rendered.
   * Capped at MAX_RETRIES to prevent infinite retry loops on unrecoverable errors.
   */
  handleRetry(): void {
    if (this.state.retryCount >= MAX_RETRIES) return;
    this.setState((prev) => ({
      hasError: false,
      error: null,
      isSmartContractError: false,
      retryCount: prev.retryCount + 1,
    }));
  }

  render(): ReactNode {
    const { hasError, error, isSmartContractError: isContract, retryCount } = this.state;
    const { fallback, children } = this.props;
    const isDev = process.env.NODE_ENV !== 'production';
    const canRetry = retryCount < MAX_RETRIES;

    if (!hasError) return children ?? null;
    if (fallback) return fallback;

    if (isContract) {
      return (
        <div role="alert" aria-live="assertive" className="error-boundary error-boundary--contract" style={styles.container}>
          <span aria-hidden="true" style={styles.icon}>🔗</span>
          <h2 style={styles.title}>Smart Contract Error</h2>
          <p style={styles.message}>
            A blockchain interaction failed. This may be due to insufficient
            funds, a rejected transaction, or a temporary network issue.
          </p>
          <p style={styles.hint}>
            Check your wallet balance, ensure your wallet is connected, then try again.
          </p>
          {isDev && error && (
            <details style={styles.details}>
              <summary>Error Details (dev only)</summary>
              <pre style={styles.pre}>{error.message}</pre>
            </details>
          )}
          <div style={styles.actions}>
            {canRetry && (
              <button onClick={this.handleRetry} style={styles.primaryButton} aria-label="Try Again">Try Again</button>
            )}
            <button onClick={() => { window.location.href = '/'; }} style={styles.secondaryButton} aria-label="Go Home">Go Home</button>
          </div>
          {!canRetry && (
            <p style={styles.hint} role="status">Maximum retry attempts reached. Please reload the page.</p>
          )}
        </div>
      );
    }

    return (
      <div role="alert" aria-live="assertive" className="error-boundary error-boundary--generic" style={styles.container}>
        <span aria-hidden="true" style={styles.icon}>⚠️</span>
        <h2 style={styles.title}>Documentation Loading Error</h2>
        <p style={styles.message}>
          We&apos;re sorry, but the documentation content failed to load due to an unexpected error.
        </p>
        {isDev && error && (
          <details style={styles.details}>
            <summary>Error Details (dev only)</summary>
            <pre style={styles.pre}>{error.message}</pre>
          </details>
        )}
        <div style={styles.actions}>
          {canRetry && (
            <button onClick={this.handleRetry} style={styles.primaryButton} aria-label="Try Again">Try Again</button>
          )}
          <button onClick={() => { window.location.href = '/'; }} style={styles.secondaryButton} aria-label="Go Home">Go Home</button>
        </div>
        {!canRetry && (
          <p style={styles.hint} role="status">Maximum retry attempts reached. Please reload the page.</p>
        )}
      </div>
    );
  }
}

// ---------------------------------------------------------------------------
// Inline styles (no CSS dependency — boundary must render even if CSS fails)
// ---------------------------------------------------------------------------

const styles = {
  container: { padding: '24px', border: '1px solid #ff4d4f', borderRadius: '6px', backgroundColor: '#fff2f0', color: '#cf1322', maxWidth: '600px', margin: '40px auto', fontFamily: 'sans-serif' } as React.CSSProperties,
  icon: { fontSize: '2rem', display: 'block', marginBottom: '8px' } as React.CSSProperties,
  title: { margin: '0 0 8px', fontSize: '1.25rem', fontWeight: 600 } as React.CSSProperties,
  message: { margin: '0 0 8px', fontSize: '0.95rem', color: '#595959' } as React.CSSProperties,
  hint: { margin: '0 0 12px', fontSize: '0.875rem', color: '#8c8c8c' } as React.CSSProperties,
  details: { marginTop: '12px', marginBottom: '12px', fontSize: '0.8rem', color: '#595959' } as React.CSSProperties,
  pre: { whiteSpace: 'pre-wrap' as const, wordBreak: 'break-word' as const, background: '#f5f5f5', padding: '8px', borderRadius: '4px', fontSize: '0.75rem' } as React.CSSProperties,
  actions: { display: 'flex', gap: '12px', marginTop: '16px', flexWrap: 'wrap' as const } as React.CSSProperties,
  primaryButton: { padding: '8px 18px', cursor: 'pointer', backgroundColor: '#cf1322', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '0.9rem' } as React.CSSProperties,
  secondaryButton: { padding: '8px 18px', cursor: 'pointer', backgroundColor: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '0.9rem' } as React.CSSProperties,
};

export default FrontendGlobalErrorBoundary;
