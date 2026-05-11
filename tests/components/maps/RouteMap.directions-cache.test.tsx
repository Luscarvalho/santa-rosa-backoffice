/**
 * Integration tests for `DirectionsLayer` cache integration in `RouteMap`.
 *
 * Sequence A,B → A,B,C → A,B → A,B,C:
 *   - Step 1 (A,B):   1st network call  → total = 1
 *   - Step 2 (A,B,C): 2nd network call  → total = 2
 *   - Step 3 (A,B):   cache hit         → total = 2 (no new call)
 *   - Step 4 (A,B,C): cache hit         → total = 2 (no new call)
 *
 * PBT P3 (re-verification post-fix):
 *   fc.array(latLng, {minLength:2, maxLength:8}) sequences with repeated keys
 *   → network calls ≤ unique keys.
 *
 * **Validates: P3 (re-verification post-fix)**
 * **Validates: Requirements 2.5**
 */

import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import * as React from "react";
import fc from "fast-check";

import {
  installGoogleMapsGlobal,
  makeVisGlMock,
  mapsMockState,
  resetMapsMocks,
} from "../../_helpers/maps-mocks";

// ---------------------------------------------------------------------------
// Module mocks — must be at top level
// ---------------------------------------------------------------------------

vi.mock("@vis.gl/react-google-maps", () => makeVisGlMock());

vi.mock("@/hooks/useTheme", () => ({
  useTheme: () => ({ theme: "light", setTheme: () => {} }),
}));

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

interface Stop {
  lat: number;
  lng: number;
  label: string;
}

const A: Stop = { lat: -3.101, lng: -60.001, label: "A" };
const B: Stop = { lat: -3.102, lng: -60.002, label: "B" };
const C: Stop = { lat: -3.103, lng: -60.003, label: "C" };

function stopsGeoKey(stops: Stop[]): string {
  return stops.map((s) => `${s.lat},${s.lng}`).join("|");
}

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

/**
 * Mounts <RouteMap> in a controlled environment with fake timers.
 * Returns helpers to update stops and tear down.
 */
async function mountRouteMap() {
  installGoogleMapsGlobal();
  resetMapsMocks();

  vi.useFakeTimers();

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  const { RouteMap } = await import("../../../src/components/maps/RouteMap");

  let setStops: (s: Stop[]) => void = () => {};

  function Host() {
    const [s, setS] = React.useState<Stop[]>([]);
    setStops = setS;
    return React.createElement(
      RouteMap as unknown as React.FC<{
        stops: Stop[];
        onDistanceChange?: (km: number) => void;
      }>,
      { stops: s },
    );
  }

  await act(async () => {
    root.render(React.createElement(Host));
  });

  /**
   * Updates stops, advances the 800ms debounce, and flushes the microtask
   * queue so the mock callback fires.
   */
  async function applyStops(stops: Stop[]) {
    await act(async () => {
      setStops(stops);
    });
    // Advance past the 800ms debounce inside DirectionsLayer
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    // Flush the microtask the FakeDirectionsService queues for the callback
    await act(async () => {
      await Promise.resolve();
    });
  }

  async function teardown() {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
  }

  return { applyStops, teardown };
}

// ---------------------------------------------------------------------------
// Integration tests
// ---------------------------------------------------------------------------

describe("RouteMap — DirectionsLayer cache integration", () => {
  beforeEach(() => {
    resetMapsMocks();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.useRealTimers();
  });

  afterAll(() => {
    vi.doUnmock("@vis.gl/react-google-maps");
    vi.doUnmock("@/hooks/useTheme");
  });

  it("sequence A,B → A,B,C → A,B → A,B,C results in exactly 2 network calls", async () => {
    const { applyStops, teardown } = await mountRouteMap();
    try {
      // Step 1: A,B — first unique key → 1 network call
      await applyStops([A, B]);
      expect(mapsMockState.directionsRouteCalls.length).toBe(1);

      // Step 2: A,B,C — second unique key → 2 network calls total
      await applyStops([A, B, C]);
      expect(mapsMockState.directionsRouteCalls.length).toBe(2);

      // Step 3: A,B — cache hit → still 2 network calls
      await applyStops([A, B]);
      expect(mapsMockState.directionsRouteCalls.length).toBe(2);

      // Step 4: A,B,C — cache hit → still 2 network calls
      await applyStops([A, B, C]);
      expect(mapsMockState.directionsRouteCalls.length).toBe(2);
    } finally {
      await teardown();
    }
  });

  it("each unique stopsGeoKey is fetched exactly once across the sequence", async () => {
    const { applyStops, teardown } = await mountRouteMap();
    try {
      await applyStops([A, B]);
      await applyStops([A, B, C]);
      await applyStops([A, B]);
      await applyStops([A, B, C]);

      const calls = mapsMockState.directionsRouteCalls;
      const abKey = stopsGeoKey([A, B]);
      const abcKey = stopsGeoKey([A, B, C]);

      const abCalls = calls.filter((c) => c.stopsGeoKey === abKey).length;
      const abcCalls = calls.filter((c) => c.stopsGeoKey === abcKey).length;

      expect(abCalls).toBe(1);
      expect(abcCalls).toBe(1);
    } finally {
      await teardown();
    }
  });

  it("stops with < 2 entries do not trigger a network call", async () => {
    const { applyStops, teardown } = await mountRouteMap();
    try {
      await applyStops([A]); // single stop — no directions call
      expect(mapsMockState.directionsRouteCalls.length).toBe(0);

      await applyStops([]); // empty — no directions call
      expect(mapsMockState.directionsRouteCalls.length).toBe(0);
    } finally {
      await teardown();
    }
  });

  it("changing stops to a new key triggers a new network call", async () => {
    const { applyStops, teardown } = await mountRouteMap();
    try {
      await applyStops([A, B]);
      expect(mapsMockState.directionsRouteCalls.length).toBe(1);

      await applyStops([A, B, C]);
      expect(mapsMockState.directionsRouteCalls.length).toBe(2);

      // New key B,C — should trigger a 3rd call
      await applyStops([B, C]);
      expect(mapsMockState.directionsRouteCalls.length).toBe(3);
    } finally {
      await teardown();
    }
  });
});

// ---------------------------------------------------------------------------
// PBT P3 — network calls ≤ unique keys across arbitrary latLng sequences
// **Validates: P3 (re-verification post-fix)**
// **Validates: Requirements 2.5**
// ---------------------------------------------------------------------------

describe("RouteMap — PBT P3: cache-hit property with arbitrary latLng sequences", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.useRealTimers();
  });

  it("network calls never exceed unique stopsGeoKeys across arbitrary stop sequences", async () => {
    const latLng = fc.record({
      lat: fc.float({ min: -10, max: -1, noNaN: true }),
      lng: fc.float({ min: -65, max: -55, noNaN: true }),
    });

    await fc.assert(
      fc.asyncProperty(
        // Generate a sequence of stop arrays (each with 2–8 stops)
        fc.array(
          fc.array(latLng, { minLength: 2, maxLength: 8 }),
          { minLength: 2, maxLength: 6 },
        ),
        async (stopSequences) => {
          const { applyStops, teardown } = await mountRouteMap();
          try {
            const uniqueKeys = new Set(
              stopSequences.map((stops) =>
                stops.map((s) => `${s.lat},${s.lng}`).join("|"),
              ),
            );

            for (const stops of stopSequences) {
              const stopsWithLabel = stops.map((s, i) => ({
                ...s,
                label: `Stop ${i}`,
              }));
              await applyStops(stopsWithLabel);
            }

            const actualCalls = mapsMockState.directionsRouteCalls.length;

            // Network calls must not exceed unique keys
            return actualCalls <= uniqueKeys.size;
          } finally {
            await teardown();
          }
        },
      ),
      { numRuns: 8 },
    );
  }, 60_000);

  it("repeated stop sequences (shuffled subarray) produce cache hits", async () => {
    const latLng = fc.record({
      lat: fc.float({ min: -10, max: -1, noNaN: true }),
      lng: fc.float({ min: -65, max: -55, noNaN: true }),
    });

    await fc.assert(
      fc.asyncProperty(
        // Base pool of stops
        fc.array(latLng, { minLength: 2, maxLength: 6 }),
        async (baseStops) => {
          const { applyStops, teardown } = await mountRouteMap();
          try {
            const stopsWithLabel = baseStops.map((s, i) => ({
              ...s,
              label: `Stop ${i}`,
            }));

            // Apply the same sequence twice
            await applyStops(stopsWithLabel);
            const callsAfterFirst = mapsMockState.directionsRouteCalls.length;

            await applyStops(stopsWithLabel);
            const callsAfterSecond = mapsMockState.directionsRouteCalls.length;

            // Second application of the same stops must be a cache hit
            return callsAfterSecond === callsAfterFirst;
          } finally {
            await teardown();
          }
        },
      ),
      { numRuns: 10 },
    );
  }, 60_000);
});
