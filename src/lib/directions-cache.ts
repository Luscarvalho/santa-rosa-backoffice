/**
 * LRU + TTL in-memory cache for `DirectionsService.route` results.
 *
 * - LRU eviction: backed by a `Map` (insertion-order iteration).
 *   On `get` (cache hit), the entry is moved to the end (delete + re-insert)
 *   to mark it as recently used. On `set`, if at capacity, the first (oldest)
 *   entry is deleted before inserting the new one.
 * - TTL: on `get`, if `Date.now() - entry.createdAt > ttlMs`, the entry is
 *   deleted and `undefined` is returned (lazy eviction).
 * - Flag bypass: when `DIRECTIONS_CACHE === false` (env `VITE_DIRECTIONS_CACHE=0`),
 *   `get` always returns `undefined` — safe bypass for rollback.
 *
 * @see design.md §Interfaces / Tipos-Chave — `src/lib/directions-cache.ts`
 * @see design.md §Fluxo 2 — Directions com cache
 */

import { DIRECTIONS_CACHE } from "./env-flags";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DirectionsCacheEntry {
  /** stopsGeoKey — deterministic cache key derived from stop coordinates */
  key: string;
  /** Raw SDK result, compatible with `DirectionsRenderer.setDirections` */
  result: google.maps.DirectionsResult;
  /** Sum of all leg distances in metres */
  totalMeters: number;
  /** Unix epoch ms when the entry was created */
  createdAt: number;
}

export interface DirectionsCacheOptions {
  /** Maximum number of entries before LRU eviction. Default 50. */
  maxEntries?: number;
  /** Time-to-live in milliseconds. Default 3_600_000 (1 hour). */
  ttlMs?: number;
}

export interface DirectionsCache {
  get(key: string): DirectionsCacheEntry | undefined;
  has(key: string): boolean;
  set(key: string, entry: DirectionsCacheEntry): void;
  clear(): void;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

const DEFAULT_MAX_ENTRIES = 50;
const DEFAULT_TTL_MS = 3_600_000; // 1 hour

/**
 * Creates a new `DirectionsCache` instance.
 *
 * Exported for testing — production code should use the `directionsCache`
 * singleton instead.
 */
export function createDirectionsCache(options?: DirectionsCacheOptions): DirectionsCache {
  const maxEntries = options?.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;

  // Map preserves insertion order, which is what we exploit for LRU.
  const store = new Map<string, DirectionsCacheEntry>();

  return {
    get(key: string): DirectionsCacheEntry | undefined {
      // Flag bypass: when the feature flag is disabled, always miss.
      if (!DIRECTIONS_CACHE) return undefined;

      const entry = store.get(key);
      if (entry === undefined) return undefined;

      // Lazy TTL eviction.
      if (Date.now() - entry.createdAt > ttlMs) {
        store.delete(key);
        return undefined;
      }

      // LRU promotion: move to end (most-recently-used position).
      store.delete(key);
      store.set(key, entry);

      return entry;
    },

    has(key: string): boolean {
      // Flag bypass: when disabled, behave as if the cache is always empty.
      if (!DIRECTIONS_CACHE) return false;

      const entry = store.get(key);
      if (entry === undefined) return false;

      // Respect TTL: expired entries report as absent. We do NOT evict here
      // so `has` stays side-effect-free; eviction happens lazily in `get`.
      if (Date.now() - entry.createdAt > ttlMs) {
        return false;
      }

      return true;
    },

    set(key: string, entry: DirectionsCacheEntry): void {
      // Remove existing entry first (to reset its LRU position).
      if (store.has(key)) {
        store.delete(key);
      }

      // LRU eviction: if at capacity, remove the oldest entry (first in Map).
      if (store.size >= maxEntries) {
        const oldestKey = store.keys().next().value;
        if (oldestKey !== undefined) {
          store.delete(oldestKey);
        }
      }

      store.set(key, entry);
    },

    clear(): void {
      store.clear();
    },
  };
}

// ---------------------------------------------------------------------------
// Default singleton
// ---------------------------------------------------------------------------

/**
 * Default singleton cache used by `DirectionsLayer` in `RouteMap`.
 *
 * Configured with the library defaults (50 entries, 1 h TTL).
 * Respects the `VITE_DIRECTIONS_CACHE` feature flag.
 */
export const directionsCache: DirectionsCache = createDirectionsCache();
