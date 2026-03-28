# Frontend Global Error Boundary

Technical reference for the React global error boundary built for the Stellar Raise frontend.

---

## Overview

`FrontendGlobalErrorBoundary` is a React class component that catches synchronous render-phase errors anywhere in its wrapped component tree. It prevents full application crashes, classifies errors as generic or smart-contract related, emits structured and rate-limited log entries, and renders an appropriate fallback UI with a recovery path.

```
Error thrown → getDerivedStateFromError (state) →
componentDidCatch → sanitizeErrorMessage → boundaryRateLimiter.isAllowed()
  → console.error (structured) → onLog callback → onError callback
  → fallback UI
```

---

## Component API

```tsx
import {
  FrontendGlobalErrorBoundary,
  ContractError,
  NetworkError,
  TransactionError,
  boundaryRateLimiter,
  sanitizeErrorMessage,
} from '../components/frontend_global_error';
```

### Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `children` | `ReactNode` | No | Component tree to protect |
| `fallback` | `ReactNode` | No | Custom fallback UI; overrides built-in fallback entirely |
| `onError` | `(report: ErrorReport) => void` | No | Callback invoked with a sanitised error report on every caught error |
| `onLog` | `(entry: BoundaryLogEntry) => void` | No | Callback invoked with the full structured log entry (new) |

### ErrorReport shape

```ts
interface ErrorReport {
  message: string;
  stack: string | undefined;        // omitted in production
  componentStack: string | undefined; // omitted in production
  timestamp: string;                // ISO 8601
  isSmartContractError: boolean;
  errorName: string;
}
```

### BoundaryLogEntry shape

```ts
interface BoundaryLogEntry {
  timestamp: string;           // ISO 8601
  level: LogLevel;             // always 'error' for caught errors
  message: string;             // human-readable classification message
  errorMessage: string;        // sanitised error message (secrets redacted)
  errorName: string;           // e.g. 'ContractError', 'Error'
  isSmartContractError: boolean;
  componentStack?: string;     // omitted in production
  stack?: string;              // omitted in production
  sequence: number;            // monotonically increasing per boundary instance
}
```

---

## Custom Error Classes

Use these to signal specific failure domains to the boundary:

```tsx
// Smart contract execution failure
throw new ContractError('Insufficient funds for transaction');

// Network / Horizon API failure
throw new NetworkError('Horizon endpoint unreachable');

// Transaction signing / submission failure
throw new TransactionError('User rejected transaction in wallet');
```

All three extend `Error` and are automatically classified as smart-contract errors by the boundary.

---

## Logging Infrastructure

### Sanitisation

`sanitizeErrorMessage(message)` strips potentially sensitive data before any log entry is emitted:

- Long hex strings (potential private keys / hashes)
- Stellar account IDs (`G` + 55 base-32 chars)
- Base64 blobs (XDR payloads, JWT tokens)
- `secret_key: <value>` and `private_key: <value>` patterns

Matched substrings are replaced with `[REDACTED]`.

### Rate Limiting

`boundaryRateLimiter` is a module-level singleton that allows at most **10 log entries per 60-second sliding window**. When the limit is exceeded:

- `console.warn` emits a suppression notice with the current sequence number.
- `onLog` and `onError` callbacks are **not** invoked.
- The fallback UI is still rendered normally.

You can reset the limiter in tests:

```ts
import { boundaryRateLimiter } from '../components/frontend_global_error';
beforeEach(() => boundaryRateLimiter.reset());
```

For other errors:
- ⚠️ Warning icon
- "Documentation Loading Error" title
- General error message
- Standard recovery options

`buildBoundaryLogEntry` produces a plain serialisable object safe to forward to any log aggregator:

- **Try Again**: Resets error state and re-renders children
- **Go Home**: Navigates to home page
- **Dismiss**: Resets error state without resolving the underlying issue — use only for transient errors
- **Error Details**: Expandable section in development mode

---

## Error Classification

The boundary classifies an error as a smart-contract error when:

1. It is an instance of `ContractError`, `NetworkError`, or `TransactionError`.
2. Its `name` or `message` contains any of these keywords (case-insensitive):
   `contract`, `stellar`, `soroban`, `transaction`, `blockchain`, `ledger`,
   `horizon`, `xdr`, `invoke`, `wallet`.

All other errors render the generic "Documentation Loading Error" fallback.

---

## Fallback UIs

### Generic fallback
- ⚠️ icon
- Title: "Documentation Loading Error"
- "Try Again" and "Go Home" buttons

### Smart contract fallback
- 🔗 icon
- Title: "Smart Contract Error"
- Blockchain-specific guidance (wallet balance, connectivity)
- "Try Again" and "Go Home" buttons

### Dev-only error details
In `NODE_ENV !== 'production'`, a collapsible `<details>` element shows the raw error message to aid debugging. This section is hidden in production to prevent information disclosure.

---

## Usage

### Basic

```tsx
import { FrontendGlobalErrorBoundary } from '../components/frontend_global_error';

function App() {
  return (
    <FrontendGlobalErrorBoundary>
      <MainApplication />
    </FrontendGlobalErrorBoundary>
  );
}
```

### With structured logging (Datadog / CloudWatch)

```tsx
<FrontendGlobalErrorBoundary
  onLog={(entry) => myLogAggregator.send(entry)}
  onError={(report) => Sentry.captureMessage(report.message, { extra: report })}
>
  <MainApplication />
</FrontendGlobalErrorBoundary>
```

### Throwing typed errors in contract components

```tsx
import { ContractError } from '../components/frontend_global_error';

async function contribute(amount: number) {
  try {
    await contract.invoke('contribute', { amount });
  } catch (err) {
    throw new ContractError(`Contribution failed: ${(err as Error).message}`);
  }
}
```

---

## Security Considerations

| Concern | Mitigation |
|---------|-----------|
| Information disclosure | Stack traces and component stacks are omitted from `ErrorReport` and `BoundaryLogEntry` in production |
| Secret leakage in logs | `sanitizeErrorMessage` redacts hex keys, Stellar IDs, base64 blobs, and key patterns before logging |
| Log flooding | `boundaryRateLimiter` caps entries at 10 per 60 s; excess entries emit a single warning |
| XSS via error messages | Fallback UI renders error message as React text node (not `innerHTML`) |
| Sensitive contract data | Custom error classes should never embed private keys, XDR, or account secrets in the message |
| Async errors | The boundary does NOT catch errors in event handlers, `setTimeout`, or SSR — handle those separately |

---

## Limitations

- Cannot catch errors thrown inside the boundary's own `render` method.
- Does not catch async errors (event handlers, `Promise` rejections, `setTimeout`).
- Does not catch server-side rendering errors (use Next.js `_error.tsx` / `500.tsx` for those).
- Nested boundaries can be used for more granular isolation of subsections.

---

## Test Coverage

Tests live in `frontend/components/frontend_global_error.test.tsx` and cover:

- Custom error class instantiation and inheritance
- `sanitizeErrorMessage` — all redaction patterns and edge cases
- `isSmartContractError` — all keyword and type variants
- `BoundaryRateLimiter` — allow, block, and reset behaviour
- `buildBoundaryLogEntry` — shape, sanitisation, and dev/prod stack inclusion
- `buildErrorReport` — shape and field correctness
- Normal (no-error) rendering
- Generic error fallback rendering and logging
- Smart contract error detection (10 keyword/type variants)
- Custom fallback prop (generic and contract errors)
- Recovery via "Try Again" (success and persistent-error cases)
- `onError` callback with structured report validation
- `onLog` callback with `BoundaryLogEntry` validation
- Rate limiting — suppression, callback blocking, and post-reset recovery
- Accessibility (`role="alert"`, `aria-live`, `aria-label`, `aria-hidden`)
- Edge cases: empty message, TypeError, keyword matching

Target: ≥ 95% statement and line coverage, 100% function coverage.

---

## Integration with Next.js

```tsx
// pages/_app.tsx
import GlobalErrorBoundary from '../components/frontend_global_error';

function MyApp({ Component, pageProps }) {
  return (
    <GlobalErrorBoundary>
      <Component {...pageProps} />
    </GlobalErrorBoundary>
  );
}
```

The boundary handles client-side render errors. `pages/500.tsx` handles server-side errors. Both should be present for full coverage.
