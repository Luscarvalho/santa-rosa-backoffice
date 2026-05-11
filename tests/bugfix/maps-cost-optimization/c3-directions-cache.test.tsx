/**
 * C3 — Bug Condition: `DirectionsLayer` in RouteMap re-calls
 * `DirectionsService.route()` for `stopsGeoKey` combinations that have
 * already been computed in the current session, because there is no
 * in-memory cache keyed by `stopsGeoKey`.
 *
 * **Validates: Requirements 2.5**
 *
 * Property (from tasks.md §1 C3):
 *   Given the sequence A → AB → ABC → AB → ABC, count calls to
 *   `DirectionsService.route`. Property: ∀ X where stopsGeoKey(X) ∈
 *   cache.keys ⇒ network_calls(X) = 0.
 *
 * EXPECTED IN F: for the 5-step sequence, F makes 4 calls (for AB, ABC, AB,
 * ABC — A is <2 stops and is skipped). The cache-hit property fails on the
 * 4th and 5th steps (the repeats).
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  afterAll,
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

vi.mock("@vis.gl/react-google-maps", () => makeVisGlMock());

// useTheme is consumed by RouteMap. Stub it so the test doesn't require
// wrapping in ThemeProvider.
vi.mock("@/hooks/useTheme", () => ({
  useTheme: () => ({ theme: "light", setTheme: () => {} }),
}));
vi.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({ theme: "light", setTheme: () => {} }),
}));

interface Stop {
  lat: number;
  lng: number;
  label: string;
}

const A: Stop = { lat: -3.101, lng: -60.001, label: "A" };
const B: Stop = { lat: -3.102, lng: -60.002, label: "B" };
const C: Stop = { lat: -3.103, lng: -60.003, label: "C" };

function stopsGeoKey(stops: Stop[]) {
  return stops.map((s) => `${s.lat},${s.lng}`).join("|");
}

/** Render <RouteMap stops={stops}/> and return a controller to update stops. */
async function mountRouteMap() {
  installGoogleMapsGlobal();
  resetMapsMocks();

  // Use fake timers so the 800ms debounce inside DirectionsLayer is controlled
  // deterministically. `vi.useFakeTimers` replaces setTimeout + clearTimeout.
  vi.useFakeTimers();

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  const { RouteMap } = await import("../../../src/components/maps/RouteMap");

  let setStops: (s: Stop[]) => void = () => {};

  function Host() {
    const [s, setS] = React.useState<Stop[]>([]);
    setStops = setS;
    return React.createElement(RouteMap as unknown as React.FC<{
      stops: Stop[];
      onDistanceChange?: (km: number) => void;
    }>, {
      stops: s,
    });
  }

  await act(async () => {
    root.render(React.createElement(Host));
  });

  async function applyStops(stops: Stop[]) {
    await act(async () => {
      setStops(stops);
    });
    // Flush the 800ms debounce.
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    // Flush the microtask the mock queues for the callback.
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

describe("C3 — Directions cache miss on repeated stopsGeoKey (BUG EXPLORATION)", () => {
  beforeEach(() => {
    resetMapsMocks();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    // vi.useRealTimers is handled in teardown — safety net:
    vi.useRealTimers();
  });

  afterAll(() => {
    vi.doUnmock("@vis.gl/react-google-maps");
  });

  it("[concrete] A → AB → ABC → AB → ABC ⇒ AB and ABC repeats must be cache-hits (network_calls = 0)", async () => {
    const { applyStops, teardown } = await mountRouteMap();
    try {
      await applyStops([A]); // skipped (<2)
      await applyStops([A, B]); // 1st request
      await applyStops([A, B, C]); // 2nd request
      await applyStops([A, B]); // REPEAT of AB — must be cache hit
      await applyStops([A, B, C]); // REPEAT of ABC — must be cache hit

      const calls = mapsMockState.directionsRouteCalls;
      const abKey = stopsGeoKey([A, B]);
      const abcKey = stopsGeoKey([A, B, C]);

      const abCalls = calls.filter((c) => c.stopsGeoKey === abKey).length;
      const abcCalls = calls.filter((c) => c.stopsGeoKey === abcKey).length;

      // Property: after the first miss, any repeat SHALL NOT emit a new
      // DirectionsService.route call. Fails in F (both counts >= 2).
      expect(abCalls).toBe(1);
      expect(abcCalls).toBe(1);
      // Total budget: exactly 2 network calls for the whole sequence.
      expect(calls.length).toBe(2);
    } finally {
      await teardown();
    }
  });

  it("[property] ∀ permutation of [A,B,C] stop-sequence traces: repeated keys ⇒ cache hits (0 new calls)", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Each element is a subset of {A,B,C} expressed as a bitmask-like
        // tuple of booleans, guaranteeing the key space is small and deterministic.
        fc.array(
          fc.constantFrom<"AB" | "ABC" | "AC" | "BC">("AB", "ABC", "AC", "BC"),
          { minLength: 2, maxLength: 6 },
        ),
        async (sequence) => {
          const { applyStops, teardown } = await mountRouteMap();
          try {
            const keyToStops: Record<string, Stop[]> = {
              AB: [A, B],
              ABC: [A, B, C],
              AC: [A, C],
              BC: [B, C],
            };
            const seen = new Set<string>();
            let expectedNetworkCalls = 0;

            for (const key of sequence) {
              const stops = keyToStops[key];
              const gk = stopsGeoKey(stops);
              if (!seen.has(gk)) {
                seen.add(gk);
                expectedNetworkCalls += 1;
              }
              await applyStops(stops);
            }

            const actual = mapsMockState.directionsRouteCalls.length;
            // Returns true when cache is respected; fails otherwise.
            return actual === expectedNetworkCalls;
          } finally {
            await teardown();
          }
        },
      ),
      { numRuns: 8 },
    );
  });
});
