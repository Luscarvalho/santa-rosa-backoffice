/**
 * Preservation — hidden → visible handoff.
 *
 * **Validates: Requirements 3.12**
 *
 * Spec says: when the tab becomes visible again after being hidden,
 * `useDriverLocations`/`useDriverTrails` SHALL continue to deliver the
 * most recent Firestore state as soon as the listener is re-subscribed,
 * without requiring a page reload.
 *
 * Observation-first — the oracle is simple:
 *   1. Mount a host that consumes `useDriverLocations`.
 *   2. Seed data. Toggle visibility hidden → update seed → visible.
 *   3. Assert that AFTER visible (F may continue delivering; F' must
 *      re-subscribe and immediately deliver) the consumer sees the latest
 *      seed.
 *
 * In current F there is no visibility-pause, so the property "the consumer
 * sees the latest state right after visible" is trivially true — the
 * listener was never unsubscribed. For F' the listener will have been
 * unsubscribed during the hidden window; re-subscribing will call our mock's
 * `emitTo` synchronously which delivers the latest seed immediately. Either
 * way, the preservation contract holds.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import * as React from "react";
import fc from "fast-check";

import {
  createFirestoreMockModule,
  resetFirestoreMockState,
  seedLocations,
  type LocationDoc,
} from "../../../_helpers/firestore-mocks";
import {
  setVisibility,
  resetVisibility,
} from "../../../_helpers/visibility-mocks";

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

function makeDoc(
  driverId: string,
  lat: number,
  lng: number,
): LocationDoc {
  return {
    id: driverId,
    driverId,
    routeId: "r1",
    lat,
    lng,
    speed: 10,
    heading: 0,
    accuracy: 5,
    status: "active",
  };
}

async function runHandoff(
  initialSeed: LocationDoc[],
  updatedSeed: LocationDoc[],
  hiddenForMs: number,
) {
  vi.resetModules();
  const { useDriverLocations } = await import(
    "../../../../src/hooks/useDriverLocations"
  );

  const snapshots: unknown[][] = [];

  function Host() {
    const locs = useDriverLocations();
    snapshots.push(locs);
    return null;
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  vi.useFakeTimers();
  try {
    setVisibility("visible");
    seedLocations(initialSeed);

    await act(async () => {
      root.render(React.createElement(Host));
    });

    // Tab becomes hidden.
    setVisibility("hidden");
    await act(async () => {
      vi.advanceTimersByTime(hiddenForMs);
      await Promise.resolve();
    });

    // Firestore state mutates while hidden (server continues to update).
    seedLocations(updatedSeed);

    // Tab comes back.
    setVisibility("visible");
    await act(async () => {
      vi.advanceTimersByTime(100);
      await Promise.resolve();
    });

    // Allow one additional microtask for the re-subscribe + first emit (F')
    // or the pre-existing subscription path (F).
    await act(async () => {
      await Promise.resolve();
    });

    const latest = snapshots.at(-1) ?? [];
    return { latest: latest as LocationDoc[] };
  } finally {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    resetVisibility();
    vi.useRealTimers();
  }
}

describe("Preservation — hidden → visible handoff (3.12)", () => {
  beforeEach(() => {
    resetFirestoreMockState();
    resetVisibility();
  });

  afterEach(() => {
    resetFirestoreMockState();
    resetVisibility();
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("[concrete] updated seed during hidden is visible after returning to visible (no reload needed)", async () => {
    const initial = [makeDoc("d1", -3.1, -60.0)];
    const updated = [makeDoc("d1", -3.11, -60.01), makeDoc("d2", -3.12, -60.02)];

    const { latest } = await runHandoff(initial, updated, 31_000);

    // Order-insensitive set equality on driverId+lat+lng.
    const keyOf = (l: LocationDoc) => `${l.driverId}:${l.lat},${l.lng}`;
    const got = new Set(latest.map(keyOf));
    const want = new Set(updated.map(keyOf));
    expect(got).toEqual(want);
  });

  it("[property] ∀ initialSeed, updatedSeed, hiddenForMs ∈ [0, 120_000]: after visible, latest snapshot = updatedSeed", async () => {
    const docGen = fc.record({
      driverId: fc.string({ minLength: 1, maxLength: 6 }).filter(
        (s) => s.trim().length > 0,
      ),
      lat: fc.double({ min: -20, max: 20, noNaN: true }),
      lng: fc.double({ min: -80, max: -40, noNaN: true }),
    });

    await fc.assert(
      fc.asyncProperty(
        fc.array(docGen, { maxLength: 3 }),
        fc.array(docGen, { maxLength: 3 }),
        fc.integer({ min: 0, max: 120_000 }),
        async (a, b, hiddenForMs) => {
          // Dedupe by driverId.
          const dedupe = (
            xs: Array<{ driverId: string; lat: number; lng: number }>,
          ) => {
            const seen = new Set<string>();
            return xs.filter((x) => {
              if (seen.has(x.driverId)) return false;
              seen.add(x.driverId);
              return true;
            });
          };
          const initial = dedupe(a).map((x) =>
            makeDoc(x.driverId, x.lat, x.lng),
          );
          const updated = dedupe(b).map((x) =>
            makeDoc(x.driverId, x.lat, x.lng),
          );
          resetFirestoreMockState();

          const { latest } = await runHandoff(initial, updated, hiddenForMs);

          const keyOf = (l: LocationDoc) => `${l.driverId}:${l.lat},${l.lng}`;
          const got = new Set(latest.map(keyOf));
          const want = new Set(updated.map(keyOf));
          if (got.size !== want.size) return false;
          for (const k of want) if (!got.has(k)) return false;
          return true;
        },
      ),
      { numRuns: 5 },
    );
  });
});
