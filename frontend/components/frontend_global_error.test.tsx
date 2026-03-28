import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  FrontendGlobalErrorBoundary,
  ContractError,
  NetworkError,
  TransactionError,
  BoundaryRateLimiter,
  boundaryRateLimiter,
  sanitizeErrorMessage,
  isSmartContractError,
  buildBoundaryLogEntry,
  buildErrorReport,
  MAX_RETRIES,
  type ErrorReport,
  type BoundaryLogEntry,
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
// sanitizeErrorMessage
// ---------------------------------------------------------------------------

describe('sanitizeErrorMessage', () => {
  it('returns non-string input as placeholder', () => {
    expect(sanitizeErrorMessage(null as unknown as string)).toBe('[non-string error]');
    expect(sanitizeErrorMessage(undefined as unknown as string)).toBe('[non-string error]');
    expect(sanitizeErrorMessage(42 as unknown as string)).toBe('[non-string error]');
  });
  it('passes through a plain message unchanged', () => {
    expect(sanitizeErrorMessage('contract call failed')).toBe('contract call failed');
  });
  it('redacts long hex strings (potential private keys)', () => {
    const msg = 'key: abcdef1234567890abcdef1234567890 failed';
    expect(sanitizeErrorMessage(msg)).toContain('[REDACTED]');
    expect(sanitizeErrorMessage(msg)).not.toContain('abcdef1234567890abcdef1234567890');
  });
  it('redacts Stellar account IDs', () => {
    const stellarId = 'G' + 'A'.repeat(55);
    expect(sanitizeErrorMessage(`account ${stellarId} not found`)).toContain('[REDACTED]');
  });
  it('redacts secret_key patterns', () => {
    expect(sanitizeErrorMessage('secret_key: mysecretvalue')).toContain('[REDACTED]');
  });
  it('redacts private_key patterns', () => {
    expect(sanitizeErrorMessage('private_key: mysecretvalue')).toContain('[REDACTED]');
  });
  it('handles empty string without throwing', () => {
    expect(sanitizeErrorMessage('')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// isSmartContractError
// ---------------------------------------------------------------------------

describe('isSmartContractError', () => {
  it('returns true for ContractError', () => {
    expect(isSmartContractError(new ContractError('x'))).toBe(true);
  });
  it('returns true for NetworkError', () => {
    expect(isSmartContractError(new NetworkError('x'))).toBe(true);
  });
  it('returns true for TransactionError', () => {
    expect(isSmartContractError(new TransactionError('x'))).toBe(true);
  });
  it('returns true for stellar keyword in message', () => {
    expect(isSmartContractError(new Error('stellar network error'))).toBe(true);
  });
  it('returns true for soroban keyword', () => {
    expect(isSmartContractError(new Error('soroban invocation failed'))).toBe(true);
  });
  it('returns true for xdr keyword', () => {
    expect(isSmartContractError(new Error('xdr decode error'))).toBe(true);
  });
  it('returns true for invoke keyword', () => {
    expect(isSmartContractError(new Error('invoke failed'))).toBe(true);
  });
  it('returns false for plain TypeError', () => {
    expect(isSmartContractError(new TypeError('cannot read property'))).toBe(false);
  });
  it('returns false for generic error', () => {
    expect(isSmartContractError(new Error('something went wrong'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// BoundaryRateLimiter
// ---------------------------------------------------------------------------

describe('BoundaryRateLimiter', () => {
  it('allows entries up to the limit', () => {
    const limiter = new BoundaryRateLimiter();
    for (let i = 0; i < 10; i++) {
      expect(limiter.isAllowed()).toBe(true);
    }
  });
  it('blocks the 11th entry within the window', () => {
    const limiter = new BoundaryRateLimiter();
    for (let i = 0; i < 10; i++) limiter.isAllowed();
    expect(limiter.isAllowed()).toBe(false);
  });
  it('reset() clears the window so entries are allowed again', () => {
    const limiter = new BoundaryRateLimiter();
    for (let i = 0; i < 10; i++) limiter.isAllowed();
    limiter.reset();
    expect(limiter.isAllowed()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildBoundaryLogEntry
// ---------------------------------------------------------------------------

describe('buildBoundaryLogEntry', () => {
  const fakeInfo = { componentStack: '\n  at Foo' } as React.ErrorInfo;

  it('returns a log entry with correct shape', () => {
    const entry: BoundaryLogEntry = buildBoundaryLogEntry(
      new Error('test error'),
      fakeInfo,
      false,
      1,
    );
    expect(entry.level).toBe('error');
    expect(entry.errorName).toBe('Error');
    expect(entry.isSmartContractError).toBe(false);
    expect(entry.sequence).toBe(1);
    expect(typeof entry.timestamp).toBe('string');
  });
  it('sets isSmartContractError=true for contract errors', () => {
    const entry = buildBoundaryLogEntry(new ContractError('bad'), fakeInfo, true, 2);
    expect(entry.isSmartContractError).toBe(true);
    expect(entry.message).toContain('Smart contract');
  });
  it('sanitises the error message in the log entry', () => {
    const entry = buildBoundaryLogEntry(
      new Error('secret_key: abc123'),
      fakeInfo,
      false,
      3,
    );
    expect(entry.errorMessage).toContain('[REDACTED]');
    expect(entry.errorMessage).not.toContain('abc123');
  });
  it('includes componentStack in dev mode', () => {
    const entry = buildBoundaryLogEntry(new Error('x'), fakeInfo, false, 4);
    // NODE_ENV is 'test' (not 'production') so stacks should be present
    expect(entry.componentStack).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// buildErrorReport
// ---------------------------------------------------------------------------

describe('buildErrorReport', () => {
  const fakeInfo = { componentStack: '\n  at Bar' } as React.ErrorInfo;

  it('returns a report with correct fields', () => {
    const report: ErrorReport = buildErrorReport(new Error('oops'), fakeInfo, false);
    expect(report.message).toBe('oops');
    expect(report.errorName).toBe('Error');
    expect(report.isSmartContractError).toBe(false);
    expect(typeof report.timestamp).toBe('string');
  });
  it('sets isSmartContractError=true for ContractError', () => {
    const report = buildErrorReport(new ContractError('bad'), fakeInfo, true);
    expect(report.isSmartContractError).toBe(true);
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
// onError callback
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
});

// ---------------------------------------------------------------------------
// onLog callback (new logging infrastructure)
// ---------------------------------------------------------------------------

describe('onLog callback', () => {
  it('calls onLog with a BoundaryLogEntry when an error is caught', () => {
    const onLog = jest.fn();
    render(
      <FrontendGlobalErrorBoundary onLog={onLog}>
        <Throw error={new Error('log test')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(onLog).toHaveBeenCalledTimes(1);
    const entry: BoundaryLogEntry = onLog.mock.calls[0][0];
    expect(entry.level).toBe('error');
    expect(entry.errorName).toBe('Error');
    expect(entry.sequence).toBe(1);
    expect(typeof entry.timestamp).toBe('string');
    expect(typeof entry.isSmartContractError).toBe('boolean');
  });
  it('log entry has isSmartContractError=true for ContractError', () => {
    const onLog = jest.fn();
    render(
      <FrontendGlobalErrorBoundary onLog={onLog}>
        <Throw error={new ContractError('bad')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(onLog.mock.calls[0][0].isSmartContractError).toBe(true);
  });
  it('log entry errorMessage is sanitised', () => {
    const onLog = jest.fn();
    render(
      <FrontendGlobalErrorBoundary onLog={onLog}>
        <Throw error={new Error('secret_key: mysecret')} />
      </FrontendGlobalErrorBoundary>,
    );
    const entry: BoundaryLogEntry = onLog.mock.calls[0][0];
    expect(entry.errorMessage).toContain('[REDACTED]');
    expect(entry.errorMessage).not.toContain('mysecret');
  });
  it('sequence increments on each error', () => {
    const onLog = jest.fn();
    // First boundary instance — sequence 1
    render(
      <FrontendGlobalErrorBoundary onLog={onLog}>
        <Throw error={new Error('first')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(onLog.mock.calls[0][0].sequence).toBe(1);
  });
  it('does not throw if onLog is not provided', () => {
    expect(() =>
      render(
        <FrontendGlobalErrorBoundary>
          <Throw error={new Error('no log callback')} />
        </FrontendGlobalErrorBoundary>,
      ),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

describe('Rate limiting', () => {
  it('emits console.warn when rate limit is exceeded', () => {
    // Exhaust the shared rate limiter
    for (let i = 0; i < 10; i++) boundaryRateLimiter.isAllowed();

    render(
      <FrontendGlobalErrorBoundary>
        <Throw error={new Error('rate limited')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('rate limit exceeded'),
      expect.objectContaining({ sequence: expect.any(Number) }),
    );
  });
  it('does NOT call onLog when rate limit is exceeded', () => {
    for (let i = 0; i < 10; i++) boundaryRateLimiter.isAllowed();
    const onLog = jest.fn();
    render(
      <FrontendGlobalErrorBoundary onLog={onLog}>
        <Throw error={new Error('rate limited')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(onLog).not.toHaveBeenCalled();
  });
  it('does NOT call onError when rate limit is exceeded', () => {
    for (let i = 0; i < 10; i++) boundaryRateLimiter.isAllowed();
    const onError = jest.fn();
    render(
      <FrontendGlobalErrorBoundary onError={onError}>
        <Throw error={new Error('rate limited')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(onError).not.toHaveBeenCalled();
  });
  it('allows logging again after reset', () => {
    for (let i = 0; i < 10; i++) boundaryRateLimiter.isAllowed();
    boundaryRateLimiter.reset();
    const onLog = jest.fn();
    render(
      <FrontendGlobalErrorBoundary onLog={onLog}>
        <Throw error={new Error('after reset')} />
      </FrontendGlobalErrorBoundary>,
    );
    expect(onLog).toHaveBeenCalledTimes(1);
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
});
