# WASM Build Pipeline Caching System

## Overview

The WASM Build Pipeline Caching System is a secure and efficient caching solution designed for WebAssembly (WASM) build pipelines in CI/CD environments. It provides intelligent cache management with hash-based validation, automatic cleanup, and comprehensive security features.

## Features

### Core Functionality

- **Hash-Based Cache Keys**: Deterministic cache key generation using SHA-256 hashing of source files and build configuration
- **Automatic Cache Expiration**: Configurable TTL (Time-To-Live) for cache entries with automatic cleanup
- **Security Validation**: Comprehensive security checks to prevent path traversal, injection attacks, and malicious content
- **Cache Size Management**: Configurable maximum cache size with automatic eviction of oldest entries
- **Build History Tracking**: Complete audit trail of all build operations with performance metrics

### Security Features

- **Path Traversal Prevention**: Validates cache keys to prevent directory traversal attacks
- **Input Sanitization**: Sanitizes cache keys and validates artifact content
- **Suspicious Content Detection**: Identifies potentially malicious patterns in cached artifacts
- **Integrity Verification**: Hash-based verification of cached artifacts

### Performance Optimizations

- **Lazy Cleanup**: Automatic cleanup of expired entries on configurable intervals
- **LRU Eviction**: Least Recently Used eviction when cache reaches capacity
- **Deterministic Keys**: Consistent cache hits for identical build inputs
- **Efficient Storage**: Optimized memory usage with size tracking

## Architecture

### Components

#### WASMBuildPipeline (React Component)

The main React component that provides a user interface for managing the WASM build pipeline cache.

**State Management:**
- `cache`: Map of cache entries with metadata
- `config`: Configuration settings for cache behavior
- `buildHistory`: Array of build results for audit trail
- `isBuilding`: Loading state indicator

**Key Methods:**
- `generateHash()`: Creates SHA-256 hashes for content
- `validateSecurity()`: Performs security validation on cache operations
- `generateCacheKey()`: Creates deterministic cache keys from build inputs
- `isCacheValid()`: Checks if a cache entry is still valid
- `getCachedArtifact()`: Retrieves cached build artifacts
- `setCachedArtifact()`: Stores build artifacts in cache
- `cleanupExpiredCache()`: Removes expired cache entries
- `executeBuild()`: Main build function with caching support

#### CacheManager (Utility Class)

Static utility class providing cache management operations.

**Methods:**
- `validateCacheKey()`: Validates cache key format and security
- `sanitizeCacheKey()`: Sanitizes cache keys by removing invalid characters
- `formatCacheSize()`: Formats byte sizes into human-readable strings

### Data Structures

#### BuildPipelineConfig

```typescript
interface BuildPipelineConfig {
  maxCacheSize: number;           // Maximum cache size in bytes
  cacheExpirationMs: number;      // Cache expiration time in milliseconds
  enableAutoCleanup: boolean;     // Enable automatic cache cleanup
  maxCacheEntries: number;        // Maximum number of cache entries
  enableCompression: boolean;     // Enable cache compression
}
```

#### CacheEntry

```typescript
interface CacheEntry {
  key: string;                    // Unique cache key
  artifactHash: string;           // Hash of the build artifact
  timestamp: number;              // Creation timestamp
  size: number;                   // Size in bytes
  configHash: string;             // Build configuration hash
  sourceHashes: Record<string, string>; // Source file hashes
}
```

#### BuildResult

```typescript
interface BuildResult {
  success: boolean;               // Build success status
  artifact: string | null;        // Build artifact content
  duration: number;               // Build duration in milliseconds
  cacheHit: boolean;              // Whether cache was used
  error: string | null;           // Error message if failed
  warnings: string[];             // Build warnings
}
```

#### SecurityValidation

```typescript
interface SecurityValidation {
  isValid: boolean;               // Validation status
  errors: string[];               // Validation errors
  warnings: string[];             // Validation warnings
}
```

## Usage

### Basic Usage

```typescript
import { WASMBuildPipeline } from './wasm_build_pipeline';

function App() {
  return <WASMBuildPipeline />;
}
```

### Programmatic Usage

```typescript
import { CacheManager } from './wasm_build_pipeline';

// Validate a cache key
const isValid = CacheManager.validateCacheKey('my-cache-key');

// Sanitize a cache key
const sanitized = CacheManager.sanitizeCacheKey('key with spaces');

// Format cache size
const formatted = CacheManager.formatCacheSize(1024 * 1024); // "1.00 MB"
```

### Configuration

The cache system can be configured through the `BuildPipelineConfig` interface:

```typescript
const config: BuildPipelineConfig = {
  maxCacheSize: 1024 * 1024 * 100,  // 100MB
  cacheExpirationMs: 24 * 60 * 60 * 1000,  // 24 hours
  enableAutoCleanup: true,
  maxCacheEntries: 1000,
  enableCompression: true,
};
```

## Security Considerations

### Cache Key Security

1. **Length Validation**: Cache keys are limited to 256 characters
2. **Character Validation**: Only alphanumeric characters, hyphens, and underscores are allowed
3. **Path Traversal Prevention**: Keys containing `..`, `/`, or `\` are rejected
4. **Sanitization**: Invalid characters are replaced with underscores

### Artifact Security

1. **Size Limits**: Artifacts exceeding maximum cache size are rejected
2. **Content Validation**: Suspicious patterns (script tags, JavaScript URLs) trigger warnings
3. **Integrity Verification**: SHA-256 hashes verify artifact integrity
4. **Format Validation**: WASM format validation ensures artifact correctness

### Input Validation

1. **Source File Validation**: All source files are validated before caching
2. **Configuration Validation**: Build configuration is validated and hashed
3. **Deterministic Keys**: Consistent key generation prevents cache poisoning

## Testing

The test suite covers:

### Unit Tests

- Component rendering and UI elements
- Configuration management
- Cache operations (get, set, clear)
- Security validation
- Cache key generation
- Cache expiration logic

### Security Tests

- Path traversal attack prevention
- Injection attack prevention
- Malicious content detection
- Input sanitization

### Edge Cases

- Concurrent cache operations
- Maximum cache size boundaries
- Zero-size artifacts
- Special characters in source files
- Large number of cache entries

### Performance Tests

- Cache efficiency with large datasets
- Cleanup performance
- Memory usage optimization

### Integration Tests

- Full build cycle completion
- Error handling and recovery
- Cache hit/miss scenarios

## API Reference

### WASMBuildPipeline Component

#### Props

None (self-contained component)

#### State

| State | Type | Description |
|-------|------|-------------|
| cache | Map<string, CacheEntry> | Cache entries |
| config | BuildPipelineConfig | Cache configuration |
| buildHistory | BuildResult[] | Build history |
| isBuilding | boolean | Build status |

#### Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| generateHash | content: string | Promise<string> | Generates SHA-256 hash |
| validateSecurity | key: string, artifact: string | SecurityValidation | Validates security |
| generateCacheKey | sourceFiles: Record<string, string>, buildConfig: Record<string, unknown> | Promise<string> | Generates cache key |
| isCacheValid | key: string | boolean | Checks cache validity |
| getCachedArtifact | key: string | string \| null | Retrieves cached artifact |
| setCachedArtifact | key: string, artifact: string, sourceHashes: Record<string, string>, configHash: string | Promise<boolean> | Stores artifact |
| cleanupExpiredCache | void | void | Removes expired entries |
| clearCache | void | void | Clears all cache |
| executeBuild | sourceFiles: Record<string, string>, buildConfig: Record<string, unknown> | Promise<BuildResult> | Executes build |

### CacheManager Class

#### Static Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| validateCacheKey | key: string | boolean | Validates cache key |
| sanitizeCacheKey | key: string | string | Sanitizes cache key |
| formatCacheSize | bytes: number | string | Formats size string |

## Configuration Options

### Cache Size

- **Default**: 100MB (104857600 bytes)
- **Range**: 1KB - 10GB
- **Recommendation**: Set based on available memory and build artifact sizes

### Cache Expiration

- **Default**: 24 hours (86400000 ms)
- **Range**: 1 minute - 30 days
- **Recommendation**: Balance between cache freshness and build performance

### Auto Cleanup

- **Default**: Enabled
- **Interval**: 60 seconds
- **Recommendation**: Enable for production environments

### Max Cache Entries

- **Default**: 1000 entries
- **Range**: 10 - 100000
- **Recommendation**: Set based on number of unique builds

### Compression

- **Default**: Enabled
- **Impact**: Reduces memory usage, increases CPU usage
- **Recommendation**: Enable for large artifacts

## Best Practices

### Cache Key Generation

1. Include all relevant source files in the key
2. Include build configuration in the key
3. Sort files deterministically for consistent keys
4. Use cryptographic hashing for security

### Security

1. Always validate cache keys before use
2. Sanitize user input before caching
3. Monitor for suspicious content patterns
4. Implement rate limiting for cache operations
5. Log security validation failures

### Performance

1. Enable auto-cleanup for production
2. Set appropriate cache size limits
3. Monitor cache hit rates
4. Adjust expiration times based on build frequency
5. Use compression for large artifacts

### Monitoring

1. Track cache hit/miss ratios
2. Monitor cache size utilization
3. Log build durations and cache performance
4. Alert on security validation failures
5. Track cache eviction rates

## Troubleshooting

### Cache Misses

**Symptoms**: Frequent cache misses, slow builds

**Solutions**:
- Verify cache key generation is deterministic
- Check if source files are changing unexpectedly
- Ensure build configuration is stable
- Review cache expiration settings

### Memory Issues

**Symptoms**: High memory usage, out of memory errors

**Solutions**:
- Reduce max cache size
- Enable compression
- Decrease max cache entries
- Reduce cache expiration time

### Security Warnings

**Symptoms**: Frequent security validation warnings

**Solutions**:
- Review source files for suspicious content
- Validate build configuration
- Check for malicious input
- Review cache key generation

### Build Failures

**Symptoms**: Builds failing with cache errors

**Solutions**:
- Clear cache and retry
- Check cache configuration
- Verify source file integrity
- Review error logs

## Examples

### Example 1: Basic Build with Caching

```typescript
const sourceFiles = {
  'main.ts': 'export const main = () => console.log("Hello WASM");',
  'utils.ts': 'export const helper = () => "helper";',
};

const buildConfig = {
  target: 'wasm',
  optimization: 'O2',
};

const result = await executeBuild(sourceFiles, buildConfig);

if (result.success) {
  console.log(`Build completed in ${result.duration}ms`);
  console.log(`Cache hit: ${result.cacheHit}`);
} else {
  console.error(`Build failed: ${result.error}`);
}
```

### Example 2: Cache Management

```typescript
// Get cache statistics
const stats = getCacheStats;
console.log(`Cache utilization: ${stats.utilizationPercent}%`);

// Cleanup expired entries
cleanupExpiredCache();

// Clear all cache
clearCache();
```

### Example 3: Security Validation

```typescript
// Validate cache key
const validation = validateSecurity('my-key', artifact);

if (!validation.isValid) {
  console.error('Security validation failed:', validation.errors);
}

if (validation.warnings.length > 0) {
  console.warn('Security warnings:', validation.warnings);
}
```

## Contributing

### Development Setup

1. Install dependencies: `npm install`
2. Run tests: `npm test`
3. Build: `npm run build`

### Code Style

- Follow TypeScript best practices
- Use NatSpec-style comments for documentation
- Maintain 95%+ test coverage
- Include security considerations in all changes

### Testing Requirements

- Unit tests for all public methods
- Integration tests for build workflows
- Security tests for validation logic
- Edge case coverage
- Performance benchmarks

## License

MIT License - See LICENSE file for details

## Support

For issues and questions:
- Create an issue in the repository
- Contact the Stellar Raise team
- Review documentation and examples

## Changelog

### Version 1.0.0 (Initial Release)

- Hash-based cache key generation
- Automatic cache expiration and cleanup
- Security validation and sanitization
- Build history tracking
- React component interface
- Comprehensive test suite
- Full documentation
