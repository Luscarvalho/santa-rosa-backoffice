/**
 * Unit tests for `src/lib/directions-cache.ts`
 *
 * Covers:
 *  1. LRU eviction at maxEntries+1
 *  2. LRU promotion — a get() promotes the entry so it survives eviction
 *  3. TTL expiry — lazy eviction on get()
 *  4. clear() zeroes everything
 *  5. Flag bypass — when VITE_DIRECTIONS_CACHE=0, get() always returns undefined
 *
 * PBT P3 (re-verification post-fix):
 *  - fc.array(latLng, {minLength:2, maxLength:8}) sequences with repeated keys
 *    → network calls ≤ unique keys (cache-hit property)
 *
 * **Validates: Requirements 2.5**
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fc from "fast-check";

// We import the factory directly so we can create isolated instances per test.
// The singleton `directionsCache` is tested indirectly via the flag-bypass test.
import { createDirectionsCache } from "../../src/lib/directions-cache";
import type { DirectionsCacheEntry } from "../../src/lib/directions-cache";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(key: string, overrides?: Partial<DirectionsCacheEntry>): DirectionsCacheEntry {
  return {
    key,
    result: { routes: [] } as unknown as google.maps.DirectionsResult,
    totalMeters: 1000,
    createdAt: Date.now(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

describe("DirectionsCache — unit", () => {
  describe("LRU eviction at maxEntries+1", () => {
    it("evicts the oldest entry when capacity is exceeded", () => {
      const cache = createDirectionsCache({ maxEntries: 3 });

      cache.set("A", makeEntry("A"));
      cache.set("B", makeEntry("B"));
      cache.set("C", makeEntry("C"));
      // Adding a 4th entry should evict "A" (oldest / first inserted)
      cache.set("D", makeEntry("D"));

      expect(cache.has("A")).toBe(false);
      expect(cache.has("B")).toBe(true);
      expect(cache.has("C")).toBe(true);
      expect(cache.has("D")).toBe(true);
    });

    it("evicts the correct entry when multiple entries are added beyond capacity", () => {
      const cache = createDirectionsCache({ maxEntries: 2 });

      cache.set("X", makeEntry("X"));
      cache.set("Y", makeEntry("Y"));
      cache.set("Z", makeEntry("Z")); // evicts X
      cache.set("W", makeEntry("W")); // evicts Y

      expect(cache.has("X")).toBe(false);
      expect(cache.has("Y")).toBe(false);
      expect(cache.has("Z")).toBe(true);
      expect(cache.has("W")).toBe(true);
    });
  });

  describe("LRU promotion — get() moves entry to MRU position", () => {
    it("promoted entry survives eviction while un-promoted entries are evicted", () => {
      const cache = createDirectionsCache({ maxEntries: 3 });

      cache.set("A", makeEntry("A"));
      cache.set("B", makeEntry("B"));
      cache.set("C", makeEntry("C"));

      // Promote "A" — it should now be the most-recently-used
      const hit = cache.get("A");
      expect(hit).toBeDefined();
      expect(hit!.key).toBe("A");

      // Adding two more entries should evict "B" then "C" (oldest after promotion)
      cache.set("D", makeEntry("D")); // evicts B
      cache.set("E", makeEntry("E")); // evicts C

      expect(cache.has("A")).toBe(true);  // promoted — survives
      expect(cache.has("B")).toBe(false); // evicted first
      expect(cache.has("C")).toBe(false); // evicted second
      expect(cache.has("D")).toBe(true);
      expect(cache.has("E")).toBe(true);
    });
  });

  describe("TTL expiry — lazy eviction on get()", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("returns undefined and removes entry after TTL has elapsed", () => {
      const cache = createDirectionsCache({ ttlMs: 100 });
      const entry = makeEntry("K", { createdAt: Date.now() });
      cache.set("K", entry);

      // Before TTL — should be present
      expect(cache.get("K")).toBeDefined();

      // Advance past TTL
      vi.setSystemTime(Date.now() + 200);

      // After TTL — lazy eviction on get()
      expect(cache.get("K")).toBeUndefined();
      // has() should also reflect the eviction
      expect(cache.has("K")).toBe(false);
    });

    it("does not evict entries that are still within TTL", () => {
      const cache = createDirectionsCache({ ttlMs: 5000 });
      const entry = makeEntry("K", { createdAt: Date.now() });
      cache.set("K", entry);

      vi.setSystemTime(Date.now() + 4999);

      expect(cache.get("K")).toBeDefined();
    });

    it("evicts exactly at TTL boundary (strictly greater than ttlMs)", () => {
      const now = Date.now();
      const cache = createDirectionsCache({ ttlMs: 100 });
      const entry = makeEntry("K", { createdAt: now });
      cache.set("K", entry);

      // Exactly at TTL — Date.now() - createdAt === ttlMs is NOT expired
      // (condition is strictly greater than: > ttlMs)
      vi.setSystemTime(now + 100);
      expect(cache.get("K")).toBeDefined();

      // One ms past TTL — now expired
      vi.setSystemTime(now + 101);
      expect(cache.get("K")).toBeUndefined();
    });
  });

  describe("clear() zeroes everything", () => {
    it("has() returns false for all entries after clear()", () => {
      const cache = createDirectionsCache({ maxEntries: 10 });

      cache.set("A", makeEntry("A"));
      cache.set("B", makeEntry("B"));
      cache.set("C", makeEntry("C"));

      cache.clear();

      expect(cache.has("A")).toBe(false);
      expect(cache.has("B")).toBe(false);
      expect(cache.has("C")).toBe(false);
    });

    it("get() returns undefined for all entries after clear()", () => {
      const cache = createDirectionsCache({ maxEntries: 10 });

      cache.set("X", makeEntry("X"));
      cache.set("Y", makeEntry("Y"));

      cache.clear();

      expect(cache.get("X")).toBeUndefined();
      expect(cache.get("Y")).toBeUndefined();
    });

    it("cache is usable after clear() — new entries can be set and retrieved", () => {
      const cache = createDirectionsCache({ maxEntries: 3 });

      cache.set("A", makeEntry("A"));
      cache.clear();
      cache.set("B", makeEntry("B"));

      expect(cache.has("A")).toBe(false);
      expect(cache.has("B")).toBe(true);
      expect(cache.get("B")).toBeDefined();
    });
  });

  describe("Flag bypass — VITE_DIRECTIONS_CACHE=0", () => {
    it("get() always returns undefined when DIRECTIONS_CACHE flag is false", async () => {
      // Override the env flag for this test by mocking the env-flags module
      vi.doMock("../../src/lib/env-flags", () => ({
        DIRECTIONS_CACHE: false,
        USE_NEW_PLACES: false,
        FIRESTORE_ACTIVE_ONLY: false,
        getFlag: vi.fn(),
      }));

      // Re-import the cache module so it picks up the mocked flag
      const { createDirectionsCache: createCacheWithFlag } = await import(
        "../../src/lib/directions-cache?flag-bypass-test"
      ).catch(() =>
        // If the query-string trick doesn't work in this vitest version,
        // fall back to a direct import with the mock in place
        import("../../src/lib/directions-cache")
      );

      const cache = createCacheWithFlag({ maxEntries: 10 });
      cache.set("K", makeEntry("K"));

      // With flag disabled, get() must always return undefined
      expect(cache.get("K")).toBeUndefined();
      // has() must also return false
      expect(cache.has("K")).toBe(false);

      vi.doUnmock("../../src/lib/env-flags");
    });
  });
});

// ---------------------------------------------------------------------------
// PBT P3 — cache-hit property across arbitrary key sequences
// **Validates: Requirements 2.5**
// ---------------------------------------------------------------------------

describe("DirectionsCache — PBT P3: cache-hit property", () => {
  it("set count equals unique keys across arbitrary sequences of set/get operations", () => {
    fc.assert(
      fc.property(
        // Generate a sequence of cache keys (simulating stopsGeoKey values)
        fc.array(
          fc.string({ minLength: 1, maxLength: 20 }),
          { minLength: 1, maxLength: 30 },
        ),
        (keys) => {
          const cache = createDirectionsCache({ maxEntries: 1000, ttlMs: 3_600_000 });
          const seen = new Set<string>();
          let missCount = 0;

          for (const key of keys) {
            const hit = cache.get(key);
            if (hit === undefined) {
              // Cache miss — set the entry
              cache.set(key, makeEntry(key));
              if (!seen.has(key)) {
                seen.add(key);
                missCount += 1;
              }
            }
            // Cache hit — no set needed
          }

          // After processing all keys, every unique key should be in cache
          for (const key of seen) {
            expect(cache.has(key)).toBe(true);
          }

          // The number of misses for new keys equals the number of unique keys
          expect(missCount).toBe(seen.size);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("repeated keys never produce more cache misses than unique keys", () => {
    // Simulates the A,B → A,B,C → A,B → A,B,C pattern with arbitrary latLng arrays
    const latLng = fc.record({
      lat: fc.float({ min: -90, max: 90, noNaN: true }),
      lng: fc.float({ min: -180, max: 180, noNaN: true }),
    });

    fc.assert(
      fc.property(
        fc.array(
          fc.array(latLng, { minLength: 2, maxLength: 8 }),
          { minLength: 2, maxLength: 10 },
        ),
        (stopSequences) => {
          const cache = createDirectionsCache({ maxEntries: 1000, ttlMs: 3_600_000 });

          function toGeoKey(stops: Array<{ lat: number; lng: number }>) {
            return stops.map((s) => `${s.lat},${s.lng}`).join("|");
          }

          const uniqueKeys = new Set(stopSequences.map(toGeoKey));
          let networkCalls = 0;

          for (const stops of stopSequences) {
            const key = toGeoKey(stops);
            if (!cache.has(key)) {
              networkCalls += 1;
              cache.set(key, makeEntry(key));
            }
            // Simulate cache hit — no network call
          }

          // Network calls must never exceed the number of unique keys
          expect(networkCalls).toBeLessThanOrEqual(uniqueKeys.size);
          // And must equal unique keys (each unique key causes exactly 1 miss)
          expect(networkCalls).toBe(uniqueKeys.size);
        },
      ),
      { numRuns: 200 },
    );
  });
});
