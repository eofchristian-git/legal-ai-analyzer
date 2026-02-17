/**
 * Projection Cache: In-Memory Per-Clause Caching
 * Feature 006: Clause Decision Actions & Undo System
 * 
 * Caches ProjectionResult objects per clause to avoid expensive recomputation.
 * 
 * Strategy:
 * - In-memory Map (clauseId → ProjectionResult)
 * - Invalidate on any decision write for that clause
 * - 5-minute TTL as backup (in case invalidation is missed)
 * - No cross-request persistence (server restart clears cache)
 */

import { ProjectionResult } from '@/types/decisions';

// ============================================================================
// Cache Data Structure
// ============================================================================

interface CacheEntry {
  projection: ProjectionResult;
  cachedAt: Date;
}

// In-memory cache: clauseId → CacheEntry
const projectionCache = new Map<string, CacheEntry>();

// Cache TTL: 5 minutes (300,000 ms)
const CACHE_TTL_MS = 5 * 60 * 1000;

// ============================================================================
// Cache Metrics (T074: Feature 006 Phase 10)
// ============================================================================

interface CacheMetrics {
  hits: number;
  misses: number;
  invalidations: number;
  sets: number;
}

const cacheMetrics: CacheMetrics = {
  hits: 0,
  misses: 0,
  invalidations: 0,
  sets: 0,
};

// ============================================================================
// Cache Operations
// ============================================================================

/**
 * Get cached projection for a clause (if available and fresh).
 * 
 * @param clauseId - Clause ID
 * @returns Cached ProjectionResult or null if cache miss/expired
 */
export function getCachedProjection(clauseId: string): ProjectionResult | null {
  const entry = projectionCache.get(clauseId);
  
  if (!entry) {
    cacheMetrics.misses++;
    console.log(`[cache] MISS for clause ${clauseId} (total misses: ${cacheMetrics.misses})`);
    return null; // Cache miss
  }

  // Check TTL
  const ageMs = Date.now() - entry.cachedAt.getTime();
  if (ageMs > CACHE_TTL_MS) {
    // Expired - remove from cache and return null
    projectionCache.delete(clauseId);
    cacheMetrics.misses++;
    console.log(`[cache] EXPIRED for clause ${clauseId} (age: ${Math.round(ageMs / 1000)}s)`);
    return null;
  }

  cacheMetrics.hits++;
  console.log(`[cache] HIT for clause ${clauseId} (age: ${Math.round(ageMs / 1000)}s, total hits: ${cacheMetrics.hits})`);
  return entry.projection;
}

/**
 * Set/update cached projection for a clause.
 * 
 * @param clauseId - Clause ID
 * @param projection - ProjectionResult to cache
 */
export function setCachedProjection(clauseId: string, projection: ProjectionResult): void {
  projectionCache.set(clauseId, {
    projection,
    cachedAt: new Date(),
  });
  cacheMetrics.sets++;
  console.log(`[cache] SET for clause ${clauseId} (cache size: ${projectionCache.size})`);
}

/**
 * Invalidate (clear) cached projection for a clause.
 * 
 * Call this whenever a decision is applied to a clause to ensure cache coherence.
 * 
 * @param clauseId - Clause ID to invalidate
 */
export function invalidateCachedProjection(clauseId: string): void {
  const existed = projectionCache.has(clauseId);
  projectionCache.delete(clauseId);
  if (existed) {
    cacheMetrics.invalidations++;
    console.log(`[cache] INVALIDATE for clause ${clauseId} (total invalidations: ${cacheMetrics.invalidations})`);
  }
}

/**
 * Clear all cached projections (e.g., for testing or manual refresh).
 */
export function clearAllCachedProjections(): void {
  projectionCache.clear();
}

/**
 * Get cache statistics for monitoring.
 * 
 * @returns Object with cache size and entry details
 */
export function getCacheStats(): {
  size: number;
  entries: {
    clauseId: string;
    cachedAt: Date;
    ageMs: number;
  }[];
} {
  const entries = Array.from(projectionCache.entries()).map(([clauseId, entry]) => ({
    clauseId,
    cachedAt: entry.cachedAt,
    ageMs: Date.now() - entry.cachedAt.getTime(),
  }));

  return {
    size: projectionCache.size,
    entries,
  };
}

/**
 * Get cache metrics for monitoring (T074: Feature 006).
 * 
 * @returns Object with hit/miss counts, hit rate, and current cache size
 */
export function getCacheMetrics(): {
  hits: number;
  misses: number;
  hitRate: number;
  invalidations: number;
  sets: number;
  currentSize: number;
} {
  const totalRequests = cacheMetrics.hits + cacheMetrics.misses;
  const hitRate = totalRequests > 0 ? (cacheMetrics.hits / totalRequests) * 100 : 0;

  return {
    hits: cacheMetrics.hits,
    misses: cacheMetrics.misses,
    hitRate: Math.round(hitRate * 100) / 100, // Round to 2 decimal places
    invalidations: cacheMetrics.invalidations,
    sets: cacheMetrics.sets,
    currentSize: projectionCache.size,
  };
}

/**
 * Reset cache metrics (useful for testing or resetting counters).
 */
export function resetCacheMetrics(): void {
  cacheMetrics.hits = 0;
  cacheMetrics.misses = 0;
  cacheMetrics.invalidations = 0;
  cacheMetrics.sets = 0;
  console.log('[cache] Metrics reset');
}

/**
 * Remove expired entries from cache (garbage collection).
 * 
 * Can be called periodically to prevent unbounded cache growth.
 */
export function cleanupExpiredEntries(): void {
  const now = Date.now();
  const expiredKeys: string[] = [];

  for (const [clauseId, entry] of projectionCache.entries()) {
    const ageMs = now - entry.cachedAt.getTime();
    if (ageMs > CACHE_TTL_MS) {
      expiredKeys.push(clauseId);
    }
  }

  for (const key of expiredKeys) {
    projectionCache.delete(key);
  }

  if (expiredKeys.length > 0) {
    console.log(`[cache] Cleaned up ${expiredKeys.length} expired entries`);
  }
}

// Optional: Set up periodic cleanup (every 10 minutes)
// Uncomment if you want automatic cleanup in long-running processes
// setInterval(cleanupExpiredEntries, 10 * 60 * 1000);
