/**
 * Tests for `useDriverLocations` — visibility-based listener pause (P5)
 * and trail reference preservation (P8).
 *
 * **Validates: Requirements 2.8, 2.9, 3.12**
 *
 * Integration tests:
 *   - visibilitychange → hidden + 31s timer ⇒ unsubscribe called
 *   - after hidden, visibilitychange → visible ⇒ re-subscribe
 *
 * PBT P8:
 *   fc.array(snapshotPatch) that preserves (lat,lng) ⇒
 *   Object.is(prevTrails, nextTrails) = true
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import * as React from "react";
import fc from "fast-check";

import {
  type LocationDoc,
  createFirestoreMockModule,
  getActiveSubscribers,
  resetFirestoreMockState,
  seedLocations,
} from "../_helpers/firestore-mocks";
import { setVisibility, resetVisibility } from "../_helpers/visibility-mocks";

vi.mock("firebase/firestore", async () => createFirestoreMockModule());
vi.mock("firebase/app", () => ({
  initializeApp: () => ({}),
  getApp: () => ({}),
  getApps: () => [],
}));
vi.mock("firebase/auth", () => ({
  getAuth: () => ({ currentUser: null, onAuthStateChanged: () => () => {} }),
}));
vi.mock("firebase/storage", () => ({ getStorage: () => ({}) }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function mountConsumer(): Promise<() => Promise<void>> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  // Reset modules so module-level state (listeners, unsubscribe, visibilityState)
  // is fresh for each test.
  vi.resetModules();
  const { useDriverLocations } = await import(
    "../../src/hooks/useDriverLocations"
  );

  function Host() {
    useDriverLocations();
    return null;
  }

  await act(async () => {
    root.render(React.createElement(Host));
  });

  return async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  };
}

// ---------------------------------------------------------------------------
// Integration: visibility → hidden + 31s ⇒ unsubscribe
// ---------------------------------------------------------------------------

describe("useDriverLocations — visibility: hidden + 31s ⇒ unsubscribe", () => {
  beforeEach(() => {
    resetFirestoreMockState();
    resetVisibility();
  });

  afterEach(() => {
    resetFirestoreMockState();
    resetVisibility();
    vi.useRealTimers();
  });

  it("unsubscribe is called after visibilitychange → hidden + 31s", async () => {
    vi.useFakeTimers();

    seedLocations([
      { id: "d1", driverId: "d1", lat: -3.1, lng: -60, status: "active" },
    ]);

    const teardown = await mountConsumer();
    try {
      // Listener should be active right after mount
      const activeBefore = getActiveSubscribers().length;
      expect(activeBefore).toBeGreaterThan(0);

      // Emit visibilitychange → hidden
      setVisibility("hidden");

      // Advance past the 30s grace window
      await act(async () => {
        vi.advanceTimersByTime(31_000);
        await Promise.resolve();
      });

      // After grace period, listener should be paused
      const activeAfter = getActiveSubscribers().length;
      expect(activeAfter).toBe(0);
    } finally {
      await teardown();
    }
  });

  it("listener stays active if hidden for less than 30s", async () => {
    vi.useFakeTimers();

    seedLocations([
      { id: "d1", driverId: "d1", lat: -3.1, lng: -60, status: "active" },
    ]);

    const teardown = await mountConsumer();
    try {
      const activeBefore = getActiveSubscribers().length;
      expect(activeBefore).toBeGreaterThan(0);

      setVisibility("hidden");

      // Advance only 29s — still within grace window
      await act(async () => {
        vi.advanceTimersByTime(29_000);
        await Promise.resolve();
      });

      // Listener should still be active
      const activeAfter = getActiveSubscribers().length;
      expect(activeAfter).toBeGreaterThan(0);
    } finally {
      await teardown();
    }
  });
});

// ---------------------------------------------------------------------------
// Integration: after hidden, visible ⇒ re-subscribe
// ---------------------------------------------------------------------------

describe("useDriverLocations — visibility: hidden then visible ⇒ re-subscribe", () => {
  beforeEach(() => {
    resetFirestoreMockState();
    resetVisibility();
  });

  afterEach(() => {
    resetFirestoreMockState();
    resetVisibility();
    vi.useRealTimers();
  });

  it("re-subscribes when tab becomes visible after being hidden > 30s", async () => {
    vi.useFakeTimers();

    seedLocations([
      { id: "d1", driverId: "d1", lat: -3.1, lng: -60, status: "active" },
    ]);

    const teardown = await mountConsumer();
    try {
      // Confirm initial subscription
      expect(getActiveSubscribers().length).toBeGreaterThan(0);

      // Go hidden and wait past grace period
      setVisibility("hidden");
      await act(async () => {
        vi.advanceTimersByTime(31_000);
        await Promise.resolve();
      });

      // Listener should be paused
      expect(getActiveSubscribers().length).toBe(0);

      // Come back visible
      setVisibility("visible");
      await act(async () => {
        await Promise.resolve();
      });

      // Listener should be re-subscribed
      expect(getActiveSubscribers().length).toBeGreaterThan(0);
    } finally {
      await teardown();
    }
  });

  it("quick toggle (hidden < 30s then visible) does not pause listener", async () => {
    vi.useFakeTimers();

    seedLocations([
      { id: "d1", driverId: "d1", lat: -3.1, lng: -60, status: "active" },
    ]);

    const teardown = await mountConsumer();
    try {
      expect(getActiveSubscribers().length).toBeGreaterThan(0);

      // Go hidden briefly
      setVisibility("hidden");
      await act(async () => {
        vi.advanceTimersByTime(5_000);
        await Promise.resolve();
      });

      // Come back visible before grace expires
      setVisibility("visible");
      await act(async () => {
        await Promise.resolve();
      });

      // Advance past where the grace timer would have fired
      await act(async () => {
        vi.advanceTimersByTime(30_000);
        await Promise.resolve();
      });

      // Listener should still be active (grace timer was cancelled)
      expect(getActiveSubscribers().length).toBeGreaterThan(0);
    } finally {
      await teardown();
    }
  });
});

// ---------------------------------------------------------------------------
// PBT P8: trail ref preserved when (lat,lng) unchanged
// **Validates: Requirements 2.9**
// ---------------------------------------------------------------------------

describe("P8 — trail ref preservation when coords unchanged", () => {
  /**
   * We test the onSnapshotCallback logic directly by importing the module
   * and using useDriverTrails to observe trail identity.
   *
   * Strategy: mount a consumer, deliver an initial snapshot to establish
   * trails, then deliver snapshots with the same (lat,lng) values and
   * verify Object.is(prevTrails, nextTrails) = true.
   */

  beforeEach(() => {
    resetFirestoreMockState();
    resetVisibility();
  });

  afterEach(() => {
    resetFirestoreMockState();
    resetVisibility();
    vi.useRealTimers();
  });

  it("[concrete] same (lat,lng) snapshot ⇒ trails reference is preserved", async () => {
    // Seed initial location
    seedLocations([
      { id: "d1", driverId: "d1", lat: -3.1, lng: -60.0, status: "active" },
    ]);

    vi.resetModules();
    const { useDriverTrails } = await import(
      "../../src/hooks/useDriverLocations"
    );

    const trailSnapshots: Array<Record<string, Array<{ lat: number; lng: number }>>> = [];

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    function Host() {
      const trails = useDriverTrails();
      // Capture each render's trails reference
      trailSnapshots.push(trails);
      return null;
    }

    await act(async () => {
      root.render(React.createElement(Host));
    });

    // At this point we have the initial snapshot (trails updated with d1's position)
    const trailAfterFirst = trailSnapshots[trailSnapshots.length - 1];
    expect(trailAfterFirst).toBeDefined();
    expect(trailAfterFirst!["d1"]).toBeDefined();

    // Deliver same (lat,lng) again — trails should NOT change reference
    await act(async () => {
      seedLocations([
        { id: "d1", driverId: "d1", lat: -3.1, lng: -60.0, status: "active" },
      ]);
      await Promise.resolve();
    });

    const trailAfterSecond = trailSnapshots[trailSnapshots.length - 1];

    // Object.is must be true — same reference
    expect(Object.is(trailAfterFirst, trailAfterSecond)).toBe(true);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("[concrete] different (lat,lng) snapshot ⇒ trails reference changes", async () => {
    seedLocations([
      { id: "d1", driverId: "d1", lat: -3.1, lng: -60.0, status: "active" },
    ]);

    vi.resetModules();
    const { useDriverTrails } = await import(
      "../../src/hooks/useDriverLocations"
    );

    const trailSnapshots: Array<Record<string, Array<{ lat: number; lng: number }>>> = [];

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    function Host() {
      const trails = useDriverTrails();
      trailSnapshots.push(trails);
      return null;
    }

    await act(async () => {
      root.render(React.createElement(Host));
    });

    const trailAfterFirst = trailSnapshots[trailSnapshots.length - 1];

    // Deliver different (lat,lng) — trails SHOULD change reference
    await act(async () => {
      seedLocations([
        { id: "d1", driverId: "d1", lat: -3.2, lng: -60.1, status: "active" },
      ]);
      await Promise.resolve();
    });

    const trailAfterSecond = trailSnapshots[trailSnapshots.length - 1];

    // Reference must have changed
    expect(Object.is(trailAfterFirst, trailAfterSecond)).toBe(false);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("[PBT P8] fc.array(snapshotPatch) preserving (lat,lng) ⇒ Object.is(prevTrails, nextTrails) = true", async () => {
    /**
     * **Validates: Requirements 2.9**
     *
     * Generator: array of snapshot patches where each patch has the same
     * (lat,lng) as the previous one for every driver. We verify that
     * the trails reference is preserved across all such patches.
     */

    // Arbitrary driver location with fixed coords
    const driverArb = fc.record({
      id: fc.constantFrom("d1", "d2", "d3"),
      lat: fc.float({ min: -5, max: -1, noNaN: true }),
      lng: fc.float({ min: -62, max: -58, noNaN: true }),
    });

    await fc.assert(
      fc.asyncProperty(
        // Generate an initial set of drivers with their positions
        fc.array(driverArb, { minLength: 1, maxLength: 3 }),
        // Generate 1-5 additional snapshots that keep the same positions
        fc.integer({ min: 1, max: 5 }),
        async (initialDrivers, repeatCount) => {
          resetFirestoreMockState();

          // Deduplicate by id (take last occurrence)
          const byId = new Map<string, typeof initialDrivers[0]>();
          for (const d of initialDrivers) byId.set(d.id, d);
          const drivers = Array.from(byId.values());

          const seed: LocationDoc[] = drivers.map((d) => ({
            id: d.id,
            driverId: d.id,
            lat: d.lat,
            lng: d.lng,
            status: "active",
          }));

          seedLocations(seed);

          vi.resetModules();
          const { useDriverTrails } = await import(
            "../../src/hooks/useDriverLocations"
          );

          const trailRefs: Array<Record<string, Array<{ lat: number; lng: number }>>> = [];

          const container = document.createElement("div");
          document.body.appendChild(container);
          const root: Root = createRoot(container);

          function Host() {
            const trails = useDriverTrails();
            trailRefs.push(trails);
            return null;
          }

          await act(async () => {
            root.render(React.createElement(Host));
          });

          // Capture the reference after initial snapshot
          const refAfterInit = trailRefs[trailRefs.length - 1];

          // Deliver the same positions repeatCount times
          for (let i = 0; i < repeatCount; i++) {
            await act(async () => {
              seedLocations(seed); // same (lat,lng) for all drivers
              await Promise.resolve();
            });
          }

          const refAfterRepeats = trailRefs[trailRefs.length - 1];

          await act(async () => {
            root.unmount();
          });
          container.remove();

          // Trail reference must be preserved when coords didn't change
          return Object.is(refAfterInit, refAfterRepeats);
        },
      ),
      { numRuns: 20 },
    );
  });
});
