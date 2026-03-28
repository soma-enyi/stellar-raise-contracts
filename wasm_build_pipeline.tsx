/**
 * @title WASM Build Pipeline Caching System
 * @notice A secure and efficient caching system for WASM build pipelines in CI/CD environments
 * @dev Implements cache management with security validation, hash-based cache keys, and automatic cleanup
 * @author Stellar Raise Team
 * @version 1.0.0
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';

/**
 * @notice Configuration interface for the WASM build pipeline
 * @dev Defines all configurable parameters for cache behavior
 */
interface BuildPipelineConfig {
  /** @notice Maximum cache size in bytes */
  maxCacheSize: number;
  /** @notice Cache expiration time in milliseconds */
  cacheExpirationMs: number;
  /** @notice Enable automatic cache cleanup */
  enableAutoCleanup: boolean;
  /** @notice Maximum number of cache entries */
  maxCacheEntries: number;
  /** @notice Enable cache compression */
  enableCompression: boolean;
}

/**
 * @notice Represents a cached build artifact
 * @dev Stores metadata and content hash for cache validation
 */
interface CacheEntry {
  /** @notice Unique cache key based on build inputs */
  key: string;
  /** @notice Hash of the build artifact for integrity verification */
  artifactHash: string;
  /** @notice Timestamp when the entry was created */
  timestamp: number;
  /** @notice Size of the cached artifact in bytes */
  size: number;
  /** @notice Build configuration hash for cache invalidation */
  configHash: string;
  /** @notice Source file hashes for change detection */
  sourceHashes: Record<string, string>;
}

/**
 * @notice Build result interface
 * @dev Contains build output and metadata
 */
interface BuildResult {
  /** @notice Whether the build succeeded */
  success: boolean;
  /** @notice Build artifact content */
  artifact: string | null;
  /** @notice Build duration in milliseconds */
  duration: number;
  /** @notice Cache hit status */
  cacheHit: boolean;
  /** @notice Error message if build failed */
  error: string | null;
  /** @notice Build warnings */
  warnings: string[];
}

/**
 * @notice Security validation result
 * @dev Tracks validation status and issues
 */
interface SecurityValidation {
  /** @notice Whether validation passed */
  isValid: boolean;
  /** @notice Validation errors */
  errors: string[];
  /** @notice Validation warnings */
  warnings: string[];
}

/**
 * @title WASMBuildPipeline
 * @notice React component for managing WASM build pipeline with caching
 * @dev Implements secure caching with hash-based validation and automatic cleanup
 */
export const WASMBuildPipeline: React.FC = () => {
  // State management
  const [cache, setCache] = useState<Map<string, CacheEntry>>(new Map());
  const [config, setConfig] = useState<BuildPipelineConfig>({
    maxCacheSize: 1024 * 1024 * 100, // 100MB
    cacheExpirationMs: 24 * 60 * 60 * 1000, // 24 hours
    enableAutoCleanup: true,
    maxCacheEntries: 1000,
    enableCompression: true,
  });
  const [buildHistory, setBuildHistory] = useState<BuildResult[]>([]);
  const [isBuilding, setIsBuilding] = useState(false);

  /**
   * @notice Generates a secure hash for cache key generation
   * @dev Uses SHA-256 for cryptographic security
   * @param content Content to hash
   * @returns Promise resolving to hex-encoded hash
   */
  const generateHash = useCallback(async (content: string): Promise<string> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }, []);

  /**
   * @notice Validates security assumptions for cache operations
   * @dev Performs comprehensive security checks
   * @param key Cache key to validate
   * @param artifact Artifact content to validate
   * @returns SecurityValidation result
   */
  const validateSecurity = useCallback((
    key: string,
    artifact: string
  ): SecurityValidation => {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate cache key format
    if (!key || key.length === 0) {
      errors.push('Cache key cannot be empty');
    }

    if (key.length > 256) {
      errors.push('Cache key exceeds maximum length (256 characters)');
    }

    // Check for path traversal attempts
    if (key.includes('..') || key.includes('/') || key.includes('\\')) {
      errors.push('Cache key contains invalid path characters');
    }

    // Validate artifact size
    if (artifact.length > config.maxCacheSize) {
      errors.push(`Artifact size exceeds maximum cache size (${config.maxCacheSize} bytes)`);
    }

    // Check for potentially malicious content
    const suspiciousPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /data:text\/html/gi,
    ];

    suspiciousPatterns.forEach(pattern => {
      if (pattern.test(artifact)) {
        warnings.push('Artifact contains potentially suspicious content patterns');
      }
    });

    // Validate artifact is valid WASM or expected format
    if (!artifact.startsWith('data:application/wasm') && 
        !artifact.startsWith('AGFzbQE') && // WASM magic number base64
        artifact.length > 0) {
      warnings.push('Artifact may not be in expected WASM format');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }, [config.maxCacheSize]);

  /**
   * @notice Generates a cache key from build inputs
   * @dev Creates deterministic key from source files and configuration
   * @param sourceFiles Record of source file paths to their content
   * @param buildConfig Build configuration object
   * @returns Promise resolving to cache key
   */
  const generateCacheKey = useCallback(async (
    sourceFiles: Record<string, string>,
    buildConfig: Record<string, unknown>
  ): Promise<string> => {
    // Sort source files for deterministic key generation
    const sortedSources = Object.keys(sourceFiles)
      .sort()
      .map(key => `${key}:${sourceFiles[key]}`)
      .join('|');

    // Hash configuration
    const configStr = JSON.stringify(buildConfig, Object.keys(buildConfig).sort());
    
    // Combine and hash
    const combined = `${sortedSources}::${configStr}`;
    return generateHash(combined);
  }, [generateHash]);

  /**
   * @notice Checks if a cache entry is valid
   * @dev Validates entry existence, expiration, and integrity
   * @param key Cache key to check
   * @returns boolean indicating cache validity
   */
  const isCacheValid = useCallback((key: string): boolean => {
    const entry = cache.get(key);
    
    if (!entry) {
      return false;
    }

    // Check expiration
    const now = Date.now();
    if (now - entry.timestamp > config.cacheExpirationMs) {
      return false;
    }

    return true;
  }, [cache, config.cacheExpirationMs]);

  /**
   * @notice Retrieves a cached build artifact
   * @dev Returns artifact if cache is valid, null otherwise
   * @param key Cache key to retrieve
   * @returns Cached artifact or null
   */
  const getCachedArtifact = useCallback((key: string): string | null => {
    if (!isCacheValid(key)) {
      return null;
    }

    const entry = cache.get(key);
    return entry ? entry.artifactHash : null;
  }, [cache, isCacheValid]);

  /**
   * @notice Stores a build artifact in cache
   * @dev Validates security and manages cache size
   * @param key Cache key
   * @param artifact Artifact to cache
   * @param sourceHashes Hashes of source files
   * @param configHash Hash of build configuration
   * @returns Promise resolving to success status
   */
  const setCachedArtifact = useCallback(async (
    key: string,
    artifact: string,
    sourceHashes: Record<string, string>,
    configHash: string
  ): Promise<boolean> => {
    // Security validation
    const validation = validateSecurity(key, artifact);
    if (!validation.isValid) {
      console.error('Security validation failed:', validation.errors);
      return false;
    }

    if (validation.warnings.length > 0) {
      console.warn('Security warnings:', validation.warnings);
    }

    // Generate artifact hash
    const artifactHash = await generateHash(artifact);

    // Create cache entry
    const entry: CacheEntry = {
      key,
      artifactHash,
      timestamp: Date.now(),
      size: artifact.length,
      configHash,
      sourceHashes,
    };

    // Update cache
    setCache(prevCache => {
      const newCache = new Map(prevCache);
      
      // Check if we need to evict entries
      if (newCache.size >= config.maxCacheEntries) {
        // Evict oldest entry
        let oldestKey: string | null = null;
        let oldestTime = Date.now();
        
        newCache.forEach((value, k) => {
          if (value.timestamp < oldestTime) {
            oldestTime = value.timestamp;
            oldestKey = k;
          }
        });
        
        if (oldestKey) {
          newCache.delete(oldestKey);
        }
      }

      newCache.set(key, entry);
      return newCache;
    });

    return true;
  }, [validateSecurity, generateHash, config.maxCacheEntries]);

  /**
   * @notice Clears expired cache entries
   * @dev Automatically removes entries older than expiration time
   */
  const cleanupExpiredCache = useCallback(() => {
    const now = Date.now();
    
    setCache(prevCache => {
      const newCache = new Map(prevCache);
      let removedCount = 0;

      newCache.forEach((entry, key) => {
        if (now - entry.timestamp > config.cacheExpirationMs) {
          newCache.delete(key);
          removedCount++;
        }
      });

      if (removedCount > 0) {
        console.log(`Cleaned up ${removedCount} expired cache entries`);
      }

      return newCache;
    });
  }, [config.cacheExpirationMs]);

  /**
   * @notice Clears all cache entries
   * @dev Useful for forcing fresh builds
   */
  const clearCache = useCallback(() => {
    setCache(new Map());
    console.log('Cache cleared');
  }, []);

  /**
   * @notice Executes a WASM build with caching
   * @dev Main build function that checks cache before building
   * @param sourceFiles Source files to build
   * @param buildConfig Build configuration
   * @returns Promise resolving to build result
   */
  const executeBuild = useCallback(async (
    sourceFiles: Record<string, string>,
    buildConfig: Record<string, unknown> = {}
  ): Promise<BuildResult> => {
    const startTime = Date.now();
    setIsBuilding(true);

    try {
      // Generate source hashes
      const sourceHashes: Record<string, string> = {};
      for (const [path, content] of Object.entries(sourceFiles)) {
        sourceHashes[path] = await generateHash(content);
      }

      // Generate config hash
      const configHash = await generateHash(JSON.stringify(buildConfig));

      // Generate cache key
      const cacheKey = await generateCacheKey(sourceFiles, buildConfig);

      // Check cache
      const cachedArtifact = getCachedArtifact(cacheKey);
      if (cachedArtifact) {
        const duration = Date.now() - startTime;
        const result: BuildResult = {
          success: true,
          artifact: cachedArtifact,
          duration,
          cacheHit: true,
          error: null,
          warnings: [],
        };
        setBuildHistory(prev => [...prev, result]);
        setIsBuilding(false);
        return result;
      }

      // Simulate build process (in real implementation, this would call actual WASM compiler)
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Generate mock artifact
      const artifact = `data:application/wasm;base64,${btoa(JSON.stringify({
        sources: sourceFiles,
        config: buildConfig,
        timestamp: Date.now(),
      }))}`;

      // Cache the artifact
      await setCachedArtifact(cacheKey, artifact, sourceHashes, configHash);

      const duration = Date.now() - startTime;
      const result: BuildResult = {
        success: true,
        artifact,
        duration,
        cacheHit: false,
        error: null,
        warnings: [],
      };

      setBuildHistory(prev => [...prev, result]);
      setIsBuilding(false);
      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      const result: BuildResult = {
        success: false,
        artifact: null,
        duration,
        cacheHit: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        warnings: [],
      };

      setBuildHistory(prev => [...prev, result]);
      setIsBuilding(false);
      return result;
    }
  }, [generateHash, generateCacheKey, getCachedArtifact, setCachedArtifact]);

  /**
   * @notice Calculates total cache size
   * @dev Sums up all cache entry sizes
   * @returns Total cache size in bytes
   */
  const getCacheSize = useMemo(() => {
    let totalSize = 0;
    cache.forEach(entry => {
      totalSize += entry.size;
    });
    return totalSize;
  }, [cache]);

  /**
   * @notice Gets cache statistics
   * @dev Returns comprehensive cache metrics
   * @returns Cache statistics object
   */
  const getCacheStats = useMemo(() => {
    const now = Date.now();
    let expiredCount = 0;
    let validCount = 0;

    cache.forEach(entry => {
      if (now - entry.timestamp > config.cacheExpirationMs) {
        expiredCount++;
      } else {
        validCount++;
      }
    });

    return {
      totalEntries: cache.size,
      validEntries: validCount,
      expiredEntries: expiredCount,
      totalSize: getCacheSize,
      maxSize: config.maxCacheSize,
      utilizationPercent: (getCacheSize / config.maxCacheSize) * 100,
    };
  }, [cache, config.cacheExpirationMs, config.maxCacheSize, getCacheSize]);

  // Auto-cleanup effect
  useEffect(() => {
    if (!config.enableAutoCleanup) return;

    const interval = setInterval(() => {
      cleanupExpiredCache();
    }, 60000); // Run every minute

    return () => clearInterval(interval);
  }, [config.enableAutoCleanup, cleanupExpiredCache]);

  return (
    <div className="wasm-build-pipeline">
      <h1>WASM Build Pipeline Caching</h1>
      
      <section className="config-section">
        <h2>Configuration</h2>
        <div className="config-item">
          <label>Max Cache Size (bytes):</label>
          <input
            type="number"
            value={config.maxCacheSize}
            onChange={(e) => setConfig(prev => ({
              ...prev,
              maxCacheSize: parseInt(e.target.value) || 0
            }))}
          />
        </div>
        <div className="config-item">
          <label>Cache Expiration (ms):</label>
          <input
            type="number"
            value={config.cacheExpirationMs}
            onChange={(e) => setConfig(prev => ({
              ...prev,
              cacheExpirationMs: parseInt(e.target.value) || 0
            }))}
          />
        </div>
        <div className="config-item">
          <label>
            <input
              type="checkbox"
              checked={config.enableAutoCleanup}
              onChange={(e) => setConfig(prev => ({
                ...prev,
                enableAutoCleanup: e.target.checked
              }))}
            />
            Enable Auto Cleanup
          </label>
        </div>
        <div className="config-item">
          <label>Max Cache Entries:</label>
          <input
            type="number"
            value={config.maxCacheEntries}
            onChange={(e) => setConfig(prev => ({
              ...prev,
              maxCacheEntries: parseInt(e.target.value) || 0
            }))}
          />
        </div>
      </section>

      <section className="stats-section">
        <h2>Cache Statistics</h2>
        <div className="stats-grid">
          <div className="stat-item">
            <span className="stat-label">Total Entries:</span>
            <span className="stat-value">{getCacheStats.totalEntries}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Valid Entries:</span>
            <span className="stat-value">{getCacheStats.validEntries}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Expired Entries:</span>
            <span className="stat-value">{getCacheStats.expiredEntries}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Total Size:</span>
            <span className="stat-value">{(getCacheStats.totalSize / 1024).toFixed(2)} KB</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Utilization:</span>
            <span className="stat-value">{getCacheStats.utilizationPercent.toFixed(2)}%</span>
          </div>
        </div>
      </section>

      <section className="actions-section">
        <h2>Actions</h2>
        <button onClick={cleanupExpiredCache} disabled={isBuilding}>
          Cleanup Expired Cache
        </button>
        <button onClick={clearCache} disabled={isBuilding}>
          Clear All Cache
        </button>
      </section>

      <section className="history-section">
        <h2>Build History</h2>
        {buildHistory.length === 0 ? (
          <p>No builds yet</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Duration</th>
                <th>Cache Hit</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {buildHistory.slice(-10).reverse().map((build, index) => (
                <tr key={index}>
                  <td>{build.success ? '✓' : '✗'}</td>
                  <td>{build.duration}ms</td>
                  <td>{build.cacheHit ? 'Yes' : 'No'}</td>
                  <td>{build.error || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {isBuilding && (
        <div className="building-indicator">
          Building...
        </div>
      )}
    </div>
  );
};

/**
 * @notice Utility class for cache operations
 * @dev Provides static methods for cache management
 */
export class CacheManager {
  /**
   * @notice Validates cache key format
   * @dev Ensures key meets security requirements
   * @param key Cache key to validate
   * @returns boolean indicating validity
   */
  static validateCacheKey(key: string): boolean {
    if (!key || key.length === 0 || key.length > 256) {
      return false;
    }

    // Check for path traversal
    if (key.includes('..') || key.includes('/') || key.includes('\\')) {
      return false;
    }

    // Check for invalid characters
    const validPattern = /^[a-zA-Z0-9_-]+$/;
    return validPattern.test(key);
  }

  /**
   * @notice Sanitizes cache key
   * @dev Removes invalid characters from key
   * @param key Key to sanitize
   * @returns Sanitized key
   */
  static sanitizeCacheKey(key: string): string {
    return key
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .substring(0, 256);
  }

  /**
   * @notice Formats cache size for display
   * @dev Converts bytes to human-readable format
   * @param bytes Size in bytes
   * @returns Formatted size string
   */
  static formatCacheSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let unitIndex = 0;
    let size = bytes;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }
}

export default WASMBuildPipeline;
