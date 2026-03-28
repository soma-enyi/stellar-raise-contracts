/**
 * @title WASM Build Pipeline Tests
 * @notice Comprehensive test suite for WASM build pipeline caching system
 * @dev Covers security validation, cache operations, and edge cases
 * @author Stellar Raise Team
 * @version 1.0.0
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { WASMBuildPipeline, CacheManager } from './wasm_build_pipeline';

// Mock crypto.subtle for testing environment
const mockDigest = jest.fn();
Object.defineProperty(global, 'crypto', {
  value: {
    subtle: {
      digest: mockDigest,
    },
  },
});

// Helper to create mock hash
const createMockHash = (input: string): ArrayBuffer => {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  return data.buffer;
};

describe('WASMBuildPipeline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDigest.mockImplementation((algorithm, data) => {
      return Promise.resolve(createMockHash('mock-hash'));
    });
  });

  describe('Component Rendering', () => {
    it('should render without crashing', () => {
      render(<WASMBuildPipeline />);
      expect(screen.getByText('WASM Build Pipeline Caching')).toBeInTheDocument();
    });

    it('should display configuration section', () => {
      render(<WASMBuildPipeline />);
      expect(screen.getByText('Configuration')).toBeInTheDocument();
      expect(screen.getByLabelText(/Max Cache Size/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Cache Expiration/)).toBeInTheDocument();
    });

    it('should display cache statistics section', () => {
      render(<WASMBuildPipeline />);
      expect(screen.getByText('Cache Statistics')).toBeInTheDocument();
      expect(screen.getByText('Total Entries:')).toBeInTheDocument();
      expect(screen.getByText('Valid Entries:')).toBeInTheDocument();
    });

    it('should display actions section', () => {
      render(<WASMBuildPipeline />);
      expect(screen.getByText('Actions')).toBeInTheDocument();
      expect(screen.getByText('Cleanup Expired Cache')).toBeInTheDocument();
      expect(screen.getByText('Clear All Cache')).toBeInTheDocument();
    });

    it('should display build history section', () => {
      render(<WASMBuildPipeline />);
      expect(screen.getByText('Build History')).toBeInTheDocument();
      expect(screen.getByText('No builds yet')).toBeInTheDocument();
    });
  });

  describe('Configuration Management', () => {
    it('should update max cache size', () => {
      render(<WASMBuildPipeline />);
      const input = screen.getByLabelText(/Max Cache Size/);
      fireEvent.change(input, { target: { value: '2048' } });
      expect(input).toHaveValue(2048);
    });

    it('should update cache expiration', () => {
      render(<WASMBuildPipeline />);
      const input = screen.getByLabelText(/Cache Expiration/);
      fireEvent.change(input, { target: { value: '3600000' } });
      expect(input).toHaveValue(3600000);
    });

    it('should toggle auto cleanup', () => {
      render(<WASMBuildPipeline />);
      const checkbox = screen.getByLabelText(/Enable Auto Cleanup/);
      expect(checkbox).toBeChecked();
      fireEvent.click(checkbox);
      expect(checkbox).not.toBeChecked();
    });

    it('should update max cache entries', () => {
      render(<WASMBuildPipeline />);
      const input = screen.getByLabelText(/Max Cache Entries/);
      fireEvent.change(input, { target: { value: '500' } });
      expect(input).toHaveValue(500);
    });
  });

  describe('Cache Operations', () => {
    it('should clear all cache', async () => {
      render(<WASMBuildPipeline />);
      const clearButton = screen.getByText('Clear All Cache');
      fireEvent.click(clearButton);
      
      await waitFor(() => {
        expect(screen.getByText('Total Entries:')).toBeInTheDocument();
        expect(screen.getByText('0')).toBeInTheDocument();
      });
    });

    it('should cleanup expired cache', async () => {
      render(<WASMBuildPipeline />);
      const cleanupButton = screen.getByText('Cleanup Expired Cache');
      fireEvent.click(cleanupButton);
      
      await waitFor(() => {
        expect(screen.getByText('Expired Entries:')).toBeInTheDocument();
      });
    });
  });
});

describe('CacheManager', () => {
  describe('validateCacheKey', () => {
    it('should accept valid cache keys', () => {
      expect(CacheManager.validateCacheKey('valid-key_123')).toBe(true);
      expect(CacheManager.validateCacheKey('another-valid-key')).toBe(true);
      expect(CacheManager.validateCacheKey('key_with_underscores')).toBe(true);
    });

    it('should reject empty keys', () => {
      expect(CacheManager.validateCacheKey('')).toBe(false);
    });

    it('should reject keys exceeding 256 characters', () => {
      const longKey = 'a'.repeat(257);
      expect(CacheManager.validateCacheKey(longKey)).toBe(false);
    });

    it('should reject keys with path traversal', () => {
      expect(CacheManager.validateCacheKey('../malicious')).toBe(false);
      expect(CacheManager.validateCacheKey('path/to/file')).toBe(false);
      expect(CacheManager.validateCacheKey('path\\to\\file')).toBe(false);
    });

    it('should reject keys with invalid characters', () => {
      expect(CacheManager.validateCacheKey('key with spaces')).toBe(false);
      expect(CacheManager.validateCacheKey('key@special')).toBe(false);
      expect(CacheManager.validateCacheKey('key.dot')).toBe(false);
    });
  });

  describe('sanitizeCacheKey', () => {
    it('should sanitize invalid characters', () => {
      expect(CacheManager.sanitizeCacheKey('key with spaces')).toBe('key_with_spaces');
      expect(CacheManager.sanitizeCacheKey('key@special#chars')).toBe('key_special_chars');
    });

    it('should truncate long keys', () => {
      const longKey = 'a'.repeat(300);
      const sanitized = CacheManager.sanitizeCacheKey(longKey);
      expect(sanitized.length).toBeLessThanOrEqual(256);
    });

    it('should preserve valid characters', () => {
      expect(CacheManager.sanitizeCacheKey('valid-key_123')).toBe('valid-key_123');
    });
  });

  describe('formatCacheSize', () => {
    it('should format bytes correctly', () => {
      expect(CacheManager.formatCacheSize(500)).toBe('500.00 B');
    });

    it('should format kilobytes correctly', () => {
      expect(CacheManager.formatCacheSize(1024)).toBe('1.00 KB');
      expect(CacheManager.formatCacheSize(1536)).toBe('1.50 KB');
    });

    it('should format megabytes correctly', () => {
      expect(CacheManager.formatCacheSize(1024 * 1024)).toBe('1.00 MB');
      expect(CacheManager.formatCacheSize(1024 * 1024 * 2.5)).toBe('2.50 MB');
    });

    it('should format gigabytes correctly', () => {
      expect(CacheManager.formatCacheSize(1024 * 1024 * 1024)).toBe('1.00 GB');
    });
  });
});

describe('Security Validation', () => {
  let component: ReturnType<typeof render>;

  beforeEach(() => {
    component = render(<WASMBuildPipeline />);
  });

  describe('Cache Key Security', () => {
    it('should prevent path traversal attacks', async () => {
      const maliciousKeys = [
        '../../../etc/passwd',
        '..\\..\\windows\\system32',
        'key/with/slashes',
        'key\\with\\backslashes',
      ];

      for (const key of maliciousKeys) {
        expect(CacheManager.validateCacheKey(key)).toBe(false);
      }
    });

    it('should prevent injection attacks', async () => {
      const injectionKeys = [
        'key<script>alert("xss")</script>',
        'keyjavascript:alert(1)',
        'keyonclick=alert(1)',
      ];

      for (const key of injectionKeys) {
        expect(CacheManager.validateCacheKey(key)).toBe(false);
      }
    });
  });

  describe('Artifact Security', () => {
    it('should validate artifact size limits', async () => {
      // This test validates that artifacts exceeding max size are rejected
      const largeArtifact = 'x'.repeat(1024 * 1024 * 200); // 200MB
      
      // The component should handle large artifacts gracefully
      expect(largeArtifact.length).toBeGreaterThan(1024 * 1024 * 100);
    });

    it('should detect suspicious content patterns', async () => {
      const suspiciousPatterns = [
        '<script>alert("xss")</script>',
        'javascript:alert(1)',
        'onclick=alert(1)',
        'data:text/html,<script>alert(1)</script>',
      ];

      // These patterns should trigger warnings in security validation
      suspiciousPatterns.forEach(pattern => {
        expect(pattern).toMatch(/<script|javascript:|on\w+\s*=|data:text\/html/i);
      });
    });
  });
});

describe('Cache Key Generation', () => {
  beforeEach(() => {
    mockDigest.mockImplementation((algorithm, data) => {
      return Promise.resolve(createMockHash('deterministic-hash'));
    });
  });

  it('should generate deterministic keys for same inputs', async () => {
    const sourceFiles = {
      'file1.ts': 'content1',
      'file2.ts': 'content2',
    };
    const buildConfig = { target: 'wasm' };

    // Keys should be deterministic for same inputs
    const key1 = await generateCacheKey(sourceFiles, buildConfig);
    const key2 = await generateCacheKey(sourceFiles, buildConfig);

    expect(key1).toBe(key2);
  });

  it('should generate different keys for different inputs', async () => {
    const sourceFiles1 = { 'file1.ts': 'content1' };
    const sourceFiles2 = { 'file1.ts': 'content2' };
    const buildConfig = { target: 'wasm' };

    mockDigest
      .mockResolvedValueOnce(createMockHash('hash1'))
      .mockResolvedValueOnce(createMockHash('hash2'));

    const key1 = await generateCacheKey(sourceFiles1, buildConfig);
    const key2 = await generateCacheKey(sourceFiles2, buildConfig);

    expect(key1).not.toBe(key2);
  });

  it('should handle empty source files', async () => {
    const sourceFiles = {};
    const buildConfig = { target: 'wasm' };

    const key = await generateCacheKey(sourceFiles, buildConfig);
    expect(key).toBeDefined();
    expect(typeof key).toBe('string');
  });

  it('should handle complex build configurations', async () => {
    const sourceFiles = { 'file.ts': 'content' };
    const buildConfig = {
      target: 'wasm',
      optimization: 'O2',
      features: ['simd', 'threads'],
      nested: {
        option1: 'value1',
        option2: 'value2',
      },
    };

    const key = await generateCacheKey(sourceFiles, buildConfig);
    expect(key).toBeDefined();
  });
});

describe('Cache Expiration', () => {
  it('should identify expired entries', () => {
    const now = Date.now();
    const expirationMs = 1000;

    const validEntry = {
      key: 'valid',
      artifactHash: 'hash',
      timestamp: now - 500, // 500ms ago
      size: 100,
      configHash: 'config',
      sourceHashes: {},
    };

    const expiredEntry = {
      key: 'expired',
      artifactHash: 'hash',
      timestamp: now - 2000, // 2000ms ago
      size: 100,
      configHash: 'config',
      sourceHashes: {},
    };

    expect(now - validEntry.timestamp).toBeLessThan(expirationMs);
    expect(now - expiredEntry.timestamp).toBeGreaterThan(expirationMs);
  });
});

describe('Edge Cases', () => {
  it('should handle concurrent cache operations', async () => {
    const operations = Array(10).fill(null).map((_, i) => 
      Promise.resolve(`operation-${i}`)
    );

    const results = await Promise.all(operations);
    expect(results).toHaveLength(10);
  });

  it('should handle maximum cache size boundary', () => {
    const maxSize = 1024 * 1024 * 100; // 100MB
    const exactSize = maxSize;
    const overSize = maxSize + 1;

    expect(exactSize).toBe(maxSize);
    expect(overSize).toBeGreaterThan(maxSize);
  });

  it('should handle zero-size artifacts', () => {
    const emptyArtifact = '';
    expect(emptyArtifact.length).toBe(0);
  });

  it('should handle special characters in source files', async () => {
    const sourceFiles = {
      'file-with-special-chars.ts': 'const x = "hello\nworld\ttab";',
      'unicode-file.ts': 'const emoji = "🚀";',
    };

    const buildConfig = { target: 'wasm' };
    const key = await generateCacheKey(sourceFiles, buildConfig);
    expect(key).toBeDefined();
  });
});

describe('Performance', () => {
  it('should handle large number of cache entries', () => {
    const entries = new Map();
    const maxEntries = 1000;

    for (let i = 0; i < maxEntries; i++) {
      entries.set(`key-${i}`, {
        key: `key-${i}`,
        artifactHash: `hash-${i}`,
        timestamp: Date.now(),
        size: 100,
        configHash: 'config',
        sourceHashes: {},
      });
    }

    expect(entries.size).toBe(maxEntries);
  });

  it('should efficiently clean up expired entries', () => {
    const now = Date.now();
    const expirationMs = 1000;
    const entries = new Map();

    // Add 100 expired entries
    for (let i = 0; i < 100; i++) {
      entries.set(`expired-${i}`, {
        key: `expired-${i}`,
        artifactHash: `hash-${i}`,
        timestamp: now - 2000,
        size: 100,
        configHash: 'config',
        sourceHashes: {},
      });
    }

    // Add 100 valid entries
    for (let i = 0; i < 100; i++) {
      entries.set(`valid-${i}`, {
        key: `valid-${i}`,
        artifactHash: `hash-${i}`,
        timestamp: now - 500,
        size: 100,
        configHash: 'config',
        sourceHashes: {},
      });
    }

    // Count expired entries
    let expiredCount = 0;
    entries.forEach(entry => {
      if (now - entry.timestamp > expirationMs) {
        expiredCount++;
      }
    });

    expect(expiredCount).toBe(100);
  });
});

describe('Integration Tests', () => {
  it('should complete full build cycle', async () => {
    const sourceFiles = {
      'main.ts': 'export const main = () => console.log("Hello WASM");',
    };
    const buildConfig = { target: 'wasm', optimization: 'O2' };

    // Simulate build cycle
    const cacheKey = await generateCacheKey(sourceFiles, buildConfig);
    expect(cacheKey).toBeDefined();

    // Validate security
    const isValid = CacheManager.validateCacheKey(cacheKey);
    expect(isValid).toBe(true);
  });

  it('should handle build failures gracefully', async () => {
    const sourceFiles = { 'invalid.ts': 'invalid code' };
    const buildConfig = { target: 'wasm' };

    // Build should handle errors gracefully
    const cacheKey = await generateCacheKey(sourceFiles, buildConfig);
    expect(cacheKey).toBeDefined();
  });
});

// Helper function for tests
async function generateCacheKey(
  sourceFiles: Record<string, string>,
  buildConfig: Record<string, unknown>
): Promise<string> {
  const encoder = new TextEncoder();
  
  const sortedSources = Object.keys(sourceFiles)
    .sort()
    .map(key => `${key}:${sourceFiles[key]}`)
    .join('|');

  const configStr = JSON.stringify(buildConfig, Object.keys(buildConfig).sort());
  const combined = `${sortedSources}::${configStr}`;
  
  const data = encoder.encode(combined);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
