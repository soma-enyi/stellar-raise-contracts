import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  FrontendGlobalErrorBoundary,
  ContractError,
  NetworkError,
  TransactionError,
  ErrorReport,
  MAX_RETRIES,
  MAX_CLASSIFICATION_INPUT_CHARS,
  MAX_REPORT_MESSAGE_CHARS,
  MAX_DISPLAY_MESSAGE_CHARS,
  MAX_ERROR_NAME_CHARS,
  truncateForBounds,
  boundedClassificationHaystack,
} from './frontend_global_error';

const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
beforeAll(() => {
  console.error = jest.fn();
  console.warn = jest.fn();
});
afterAll(() => {
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});
beforeEach(() => {
  jest.clearAllMocks();
  boundaryRateLimiter.reset();
});

const Throw = ({ error }: { error: Error }) => { throw error; };

// ---------------------------------------------------------------------------
// Logging bounds (pure helpers + script-friendly caps)
// ---------------------------------------------------------------------------

describe('truncateForBounds', () => {
  it('returns empty string when maxCodeUnits <= 0', () => {
    expect(truncateForBounds('hello', 0)).toBe('');
    expect(truncateForBounds('hello', -1)).toBe('');
  });

  it('returns original string when within cap', () => {
    expect(truncateForBounds('hello', 10)).toBe('hello');
  });

  it('returns single ellipsis when cap is 1', () => {
    expect(truncateForBounds('hello', 1)).toBe('\u2026');
  });

  it('truncates with ellipsis when over cap', () => {
    expect(truncateForBounds('hello', 4)).toBe('hel\u2026');
  });
});

describe('boundedClassificationHaystack', () => {
  it('lowercases name and message', () => {
    const h = boundedClassificationHaystack(new Error('Stellar'));
    expect(h).toContain('stellar');
    expect(h).toContain('error');
  });
});

describe('Logging bound constants', () => {
  it('exports positive numeric caps for maintainability', () => {
    expect(MAX_CLASSIFICATION_INPUT_CHARS).toBeGreaterThan(1024);
    expect(MAX_REPORT_MESSAGE_CHARS).toBeGreaterThan(512);
    expect(MAX_DISPLAY_MESSAGE_CHARS).toBeGreaterThan(256);
    expect(MAX_ERROR_NAME_CHARS).toBeGreaterThanOrEqual(64);
  });
});

describe('ErrorReport payload bounds', () => {
  it('truncates report.message to MAX_REPORT_MESSAGE_CHARS', () => {
    const long = 'x'.repeat(MAX_REPORT_MESSAGE_CHARS + 500);
    const onError = jest.fn();
    render(
      <FrontendGlobalErrorBoundary onError={onError}>
        <Throw error={new Error(long)} />
      </FrontendGlobalErrorBoundary>,
    );
    const report: ErrorReport = onError.mock.calls[0][0];
    expect(report.message.length).toBeLessThanOrEqual(MAX_REPORT_MESSAGE_CHARS);
    expect(report.message.endsWith('\u2026')).toBe(true);
  });

  it('truncates report.errorName to MAX_ERROR_NAME_CHARS', () => {
    const onError = jest.fn();
    const e = new Error('x');
    e.name = 'Y'.repeat(MAX_ERROR_NAME_CHARS + 20);
    render(
      <FrontendGlobalErrorBoundary onError={onError}>
        <Throw error={e} />
      </FrontendGlobalErrorBoundary>,
    );
    const report: ErrorReport = onError.mock.calls[0][0];
    expect(report.errorName.length).toBeLessThanOrEqual(MAX_ERROR_NAME_CHARS);
  });
});

describe('Classification haystack window', () => {
  it('does not treat keyword-only-at-end-of-huge-message as contract error', () => {
    const prefixLen = MAX_CLASSIFICATION_INPUT_CHARS + 100;
    const msg = `${'a'.repeat(prefixLen)}stellar`;
    render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new Error(msg)} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(screen.getByText('Documentation Loading Error')).toBeTruthy();
    expect(screen.queryByText('Smart Contract Error')).toBeNull();
  });
});

describe('Dev-only display truncation', () => {
  it('shows at most MAX_DISPLAY_MESSAGE_CHARS in details pre', () => {
    const long = 'z'.repeat(MAX_DISPLAY_MESSAGE_CHARS + 400);
    const { container } = render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new Error(long)} />
      </FrontendGlobalErrorBoundary>,
    );
    const pre = container.querySelector('pre');
    expect(pre).toBeTruthy();
    expect((pre as HTMLElement).textContent!.length).toBeLessThanOrEqual(
      MAX_DISPLAY_MESSAGE_CHARS,
    );
  });
});

// ---------------------------------------------------------------------------
// Custom error classes
// ---------------------------------------------------------------------------

describe('Custom error classes', () => {
  it('ContractError has correct name and extends Error', () => {
    const e = new ContractError('bad contract');
    expect(e.name).toBe('ContractError');
    expect(e.message).toBe('bad contract');
    expect(e).toBeInstanceOf(Error);
  });
  it('NetworkError has correct name', () => {
    const e = new NetworkError('timeout');
    expect(e.name).toBe('NetworkError');
    expect(e).toBeInstanceOf(Error);
  });
  it('TransactionError has correct name', () => {
    const e = new TransactionError('rejected');
    expect(e.name).toBe('TransactionError');
    expect(e).toBeInstanceOf(Error);
  });
});

// ---------------------------------------------------------------------------
// Normal rendering (no error)
// ---------------------------------------------------------------------------

describe('Normal rendering (no error)', () => {
  it('renders children when no error is thrown', () => {
    render(
      <FrontendGlobalErrorBoundary>
        <div data-testid="child">Safe Content</div>
      </FrontendGlobalErrorBoundary>,
    );
    expect(screen.getByTestId('child')).toBeTruthy();
    expect(screen.getByText('Safe Content')).toBeTruthy();
  });
  it('renders null when children is omitted', () => {
    const { container } = render(<FrontendGlobalErrorBoundary />);
    expect(container.firstChild).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Generic error fallback
// ---------------------------------------------------------------------------

describe('Generic error fallback', () => {
  it('renders the default fallback UI on error', () => {
    render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new Error('Simulated crash')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Documentation Loading Error')).toBeTruthy();
  });
  it('shows the "Try Again" button', () => {
    render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new Error('crash')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeTruthy();
  });
  it('shows the "Go Home" button', () => {
    render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new Error('crash')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(screen.getByRole('button', { name: 'Go Home' })).toBeTruthy();
  });
  it('calls console.error with the caught error', () => {
    render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new Error('Simulated documentation crash')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(console.error).toHaveBeenCalledWith(
      'Documentation Error Boundary caught an error:',
      expect.any(Error),
      expect.objectContaining({ componentStack: expect.any(String) }),
    );
  });
  it('has role="alert" and aria-live="assertive"', () => {
    render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new Error('crash')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(screen.getByRole('alert').getAttribute('aria-live')).toBe('assertive');
  });
});

// ---------------------------------------------------------------------------
// Smart contract error fallback
// ---------------------------------------------------------------------------

describe('Smart contract error fallback', () => {
  const contractErrors: Array<[string, Error]> = [
    ['ContractError instance', new ContractError('contract call failed')],
    ['NetworkError instance', new NetworkError('horizon timeout')],
    ['TransactionError instance', new TransactionError('tx rejected')],
    ['stellar keyword', new Error('stellar network error')],
    ['soroban keyword', new Error('soroban invocation failed')],
    ['transaction keyword', new Error('transaction simulation error')],
    ['blockchain keyword', new Error('blockchain ledger closed')],
    ['wallet keyword', new Error('wallet connection lost')],
    ['xdr keyword', new Error('xdr decode error')],
    ['horizon keyword', new Error('horizon api error')],
  ];

  contractErrors.forEach(([label, err]) => {
    it('shows Smart Contract Error for ' + label, () => {
      render(
        <FrontendGlobalErrorBoundary>
          <Throw error={err} />
        </FrontendGlobalErrorBoundary>,
      );
      expect(screen.getByText('Smart Contract Error')).toBeTruthy();
    });
  });

  it('shows blockchain-specific guidance text', () => {
    render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new ContractError('insufficient funds')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(screen.getByText(/Check your wallet balance/i)).toBeTruthy();
  });

  it('does NOT show Documentation Loading Error for contract errors', () => {
    render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new ContractError('bad call')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(screen.queryByText('Documentation Loading Error')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Custom fallback prop
// ---------------------------------------------------------------------------

describe('Custom fallback prop', () => {
  it('renders the custom fallback when provided', () => {
    render(
      <FrontendGlobalErrorBoundary fallback={<div data-testid="cf">Custom Error View</div>}>
        <Throw error={new Error('crash')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(screen.getByTestId('cf')).toBeTruthy();
    expect(screen.getByText('Custom Error View')).toBeTruthy();
  });
  it('does NOT render the default fallback when custom fallback is provided', () => {
    render(
      <FrontendGlobalErrorBoundary fallback={<div>Custom</div>}>
        <Throw error={new Error('crash')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(screen.queryByText('Documentation Loading Error')).toBeNull();
    expect(screen.queryByText('Smart Contract Error')).toBeNull();
  });
  it('custom fallback overrides smart contract fallback too', () => {
    render(
      <FrontendGlobalErrorBoundary fallback={<div data-testid="cf2">My Fallback</div>}>
        <Throw error={new ContractError('bad')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(screen.getByTestId('cf2')).toBeTruthy();
    expect(screen.queryByText('Smart Contract Error')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Recovery via Try Again
// ---------------------------------------------------------------------------

describe('Recovery via Try Again', () => {
  it('re-renders children after clicking Try Again when error is resolved', () => {
    let shouldThrow = true;
    const RecoverableComponent = () => {
      if (shouldThrow) throw new Error('Temporary error');
      return <div>Recovered Content</div>;
    };
    render(
      <FrontendGlobalErrorBoundary>
        <RecoverableComponent />
      </FrontendGlobalErrorBoundary>,
    );
    expect(screen.getByText('Documentation Loading Error')).toBeTruthy();
    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(screen.getByText('Recovered Content')).toBeTruthy();
    expect(screen.queryByText('Documentation Loading Error')).toBeNull();
  });
  it('shows the fallback again if the child still throws after retry', () => {
    render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new Error('persistent error')} />
      </FrontendGlobalErrorBoundary>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(screen.getByText('Documentation Loading Error')).toBeTruthy();
  });
  it('recovery works for contract errors too', () => {
    let shouldThrow = true;
    const RecoverableContract = () => {
      if (shouldThrow) throw new ContractError('contract failed');
      return <div>Contract OK</div>;
    };
    render(
      <FrontendGlobalErrorBoundary>
        <RecoverableContract />
      </FrontendGlobalErrorBoundary>,
    );
    expect(screen.getByText('Smart Contract Error')).toBeTruthy();
    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(screen.getByText('Contract OK')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Retry cap (gas efficiency)
// ---------------------------------------------------------------------------

describe('Retry cap — gas efficiency', () => {
  it('MAX_RETRIES is exported and is a positive integer', () => {
    expect(typeof MAX_RETRIES).toBe('number');
    expect(MAX_RETRIES).toBeGreaterThan(0);
  });

  it('hides Try Again button after MAX_RETRIES exhausted', () => {
    render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new Error('persistent')} />
      </FrontendGlobalErrorBoundary>,
    );
    // Exhaust all retries
    for (let i = 0; i < MAX_RETRIES; i++) {
      fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    }
    expect(screen.queryByRole('button', { name: 'Try Again' })).toBeNull();
  });

  it('shows max-retry message after retries exhausted', () => {
    render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new Error('persistent')} />
      </FrontendGlobalErrorBoundary>,
    );
    for (let i = 0; i < MAX_RETRIES; i++) {
      fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    }
    expect(screen.getByText(/Maximum retry attempts reached/i)).toBeTruthy();
  });

  it('Go Home button remains visible after retries exhausted', () => {
    render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new Error('persistent')} />
      </FrontendGlobalErrorBoundary>,
    );
    for (let i = 0; i < MAX_RETRIES; i++) {
      fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    }
    expect(screen.getByRole('button', { name: 'Go Home' })).toBeTruthy();
  });

  it('retry cap applies to contract errors too', () => {
    render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new ContractError('persistent contract error')} />
      </FrontendGlobalErrorBoundary>,
    );
    for (let i = 0; i < MAX_RETRIES; i++) {
      fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    }
    expect(screen.queryByRole('button', { name: 'Try Again' })).toBeNull();
    expect(screen.getByText(/Maximum retry attempts reached/i)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Error classification caching (gas efficiency)
// ---------------------------------------------------------------------------

describe('Error classification caching', () => {
  it('classifies the same error instance consistently across multiple renders', () => {
    const err = new ContractError('cached');
    const onError = jest.fn();
    const { unmount } = render(
      <FrontendGlobalErrorBoundary onError={onError}>
        <Throw error={err} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(onError.mock.calls[0][0].isSmartContractError).toBe(true);
    unmount();
    // Re-render with same error instance — classification must be consistent
    render(
      <FrontendGlobalErrorBoundary onError={onError}>
        <Throw error={err} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(onError.mock.calls[1][0].isSmartContractError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Non-Error thrown values (reliability)
// ---------------------------------------------------------------------------

describe('Non-Error thrown values', () => {
  it('handles a thrown string without crashing', () => {
    const ThrowString = () => { throw 'string error'; };
    expect(() =>
      render(
        <FrontendGlobalErrorBoundary>
          <ThrowString />
        </FrontendGlobalErrorBoundary>,
      ),
    ).not.toThrow();
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('handles a thrown null without crashing', () => {
    const ThrowNull = () => { throw null; };
    expect(() =>
      render(
        <FrontendGlobalErrorBoundary>
          <ThrowNull />
        </FrontendGlobalErrorBoundary>,
      ),
    ).not.toThrow();
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('handles a thrown number without crashing', () => {
    const ThrowNumber = () => { throw 42; };
    expect(() =>
      render(
        <FrontendGlobalErrorBoundary>
          <ThrowNumber />
        </FrontendGlobalErrorBoundary>,
      ),
    ).not.toThrow();
    expect(screen.getByRole('alert')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// onError callback — called exactly once per error (gas efficiency)
// ---------------------------------------------------------------------------

describe('onError callback', () => {
  it('calls onError with a structured report when an error is caught', () => {
    const onError = jest.fn();
    render(
      <FrontendGlobalErrorBoundary onError={onError}>
        <Throw error={new Error('callback test')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(onError).toHaveBeenCalledTimes(1);
    const report: ErrorReport = onError.mock.calls[0][0];
    expect(report.message).toBe('callback test');
    expect(report.timestamp).toBeTruthy();
    expect(typeof report.isSmartContractError).toBe('boolean');
    expect(report.errorName).toBe('Error');
  });
  it('sets isSmartContractError=true for ContractError', () => {
    const onError = jest.fn();
    render(
      <FrontendGlobalErrorBoundary onError={onError}>
        <Throw error={new ContractError('bad')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(onError.mock.calls[0][0].isSmartContractError).toBe(true);
  });
  it('sets isSmartContractError=false for generic errors', () => {
    const onError = jest.fn();
    render(
      <FrontendGlobalErrorBoundary onError={onError}>
        <Throw error={new Error('generic')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(onError.mock.calls[0][0].isSmartContractError).toBe(false);
  });
  it('does not throw if onError is not provided', () => {
    expect(() =>
      render(
        <FrontendGlobalErrorBoundary>
          <Throw error={new Error('no callback')} />
        </FrontendGlobalErrorBoundary>,
      ),
    ).not.toThrow();
  });
  it('onError is called exactly once per error event, not on every render', () => {
    const onError = jest.fn();
    render(
      <FrontendGlobalErrorBoundary onError={onError}>
        <Throw error={new Error('once')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Accessibility
// ---------------------------------------------------------------------------

describe('Accessibility', () => {
  it('fallback container has role alert', () => {
    render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new Error('a11y test')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeTruthy();
  });
  it('Try Again button has aria-label', () => {
    render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new Error('a11y')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(screen.getByRole('button', { name: 'Try Again' }).getAttribute('aria-label')).toBe('Try Again');
  });
  it('Go Home button has aria-label', () => {
    render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new Error('a11y')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(screen.getByRole('button', { name: 'Go Home' }).getAttribute('aria-label')).toBe('Go Home');
  });
  it('icon span is aria-hidden', () => {
    const { container } = render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new Error('icon test')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy();
  });
  it('max-retry status message has role="status"', () => {
    render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new Error('persistent')} />
      </FrontendGlobalErrorBoundary>,
    );
    for (let i = 0; i < MAX_RETRIES; i++) {
      fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    }
    expect(screen.getByRole('status')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Error classification edge cases
// ---------------------------------------------------------------------------

describe('Error classification edge cases', () => {
  it('classifies NetworkError as smart contract error', () => {
    const onError = jest.fn();
    render(
      <FrontendGlobalErrorBoundary onError={onError}>
        <Throw error={new NetworkError('timeout')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(onError.mock.calls[0][0].isSmartContractError).toBe(true);
  });
  it('classifies TransactionError as smart contract error', () => {
    const onError = jest.fn();
    render(
      <FrontendGlobalErrorBoundary onError={onError}>
        <Throw error={new TransactionError('rejected')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(onError.mock.calls[0][0].isSmartContractError).toBe(true);
  });
  it('classifies plain Error with invoke keyword as contract error', () => {
    render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new Error('invoke failed')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(screen.getByText('Smart Contract Error')).toBeTruthy();
  });
  it('does not classify a plain TypeError as a contract error', () => {
    render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new TypeError('cannot read property')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(screen.getByText('Documentation Loading Error')).toBeTruthy();
    expect(screen.queryByText('Smart Contract Error')).toBeNull();
  });
  it('handles errors with empty messages gracefully', () => {
    expect(() =>
      render(
        <FrontendGlobalErrorBoundary>
          <Throw error={new Error('')} />
        </FrontendGlobalErrorBoundary>,
      ),
    ).not.toThrow();
    expect(screen.getByRole('alert')).toBeTruthy();
  });
  it('classifies ledger keyword as contract error', () => {
    render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new Error('ledger sequence mismatch')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(screen.getByText('Smart Contract Error')).toBeTruthy();
  });
});

// ── Documentation accuracy tests ─────────────────────────────────────────────
// These tests verify that the rendered UI matches what the documentation
// describes, catching doc/code mismatches early.

describe('Documentation accuracy', () => {
  it('generic fallback title is "Documentation Loading Error" (not "Something went wrong")', () => {
    render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new TypeError('cannot read property x')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(screen.getByText('Documentation Loading Error')).toBeTruthy();
    expect(screen.queryByText('Something went wrong')).toBeNull();
  });

  it('smart contract fallback title is "Smart Contract Error"', () => {
    render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new ContractError('bad call')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(screen.getByText('Smart Contract Error')).toBeTruthy();
  });

  it('generic fallback shows warning icon ⚠️', () => {
    const { container } = render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new Error('generic')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(container.textContent).toContain('⚠️');
  });

  it('smart contract fallback shows link icon 🔗', () => {
    const { container } = render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new ContractError('bad')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(container.textContent).toContain('🔗');
  });

  it('generic fallback has "Try Again" and "Go Home" buttons as documented', () => {
    render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new Error('generic')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Go Home' })).toBeTruthy();
  });

  it('smart contract fallback has "Try Again" and "Go Home" buttons as documented', () => {
    render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new ContractError('bad')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Go Home' })).toBeTruthy();
  });

  it('smart contract fallback shows wallet balance guidance as documented', () => {
    render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new ContractError('insufficient funds')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(screen.getByText(/Check your wallet balance/i)).toBeTruthy();
  });
});
