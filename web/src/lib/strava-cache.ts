/**
 * Simple in-memory cache for Strava API responses to reduce rate-limit usage.
 * Entries expire after 5 minutes. Capped at 200 entries to prevent unbounded growth.
 * Only used server-side in API routes.
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ENTRIES = 200;

const cache = new Map<string, CacheEntry<unknown>>();

function evictExpired(): void {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now > entry.expiresAt) {
      cache.delete(key);
    }
  }
}

export function cacheGet<T>(key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.data as T;
}

export function cacheSet<T>(key: string, data: T): void {
  // Evict expired entries if we're approaching the limit
  if (cache.size >= MAX_ENTRIES) {
    evictExpired();
  }
  // If still at capacity after eviction, remove oldest entry
  if (cache.size >= MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.set(key, { data, expiresAt: Date.now() + TTL_MS });
}
