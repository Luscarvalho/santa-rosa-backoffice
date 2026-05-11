/**
 * Preservation — `TrackingMap` follow-driver behavior.
 *
 * **Validates: Requirements 3.3, 3.8**
 *
 * Observation-first — the current `FollowDriver` effect in
 * `src/components/maps/TrackingMap.tsx` emits:
 *   - `map.panTo({lat, lng})` whenever `location.lat/lng` changes.
 *   - `map.setZoom(15)` exactly once per "follow begins" transition
 *     (selectedDriverId moves from null → a driverId).
 *
 * Oracle:
 *   We encode expected map_center_series + zoom events per scenario in
 *   `oracle/follow-behavior.json` and assert the captured `mapCalls` trace
 *   from our `@vis.gl/react-google-maps` mock matches byte-for-byte.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import * as React from "react";
import fc from "fast-check";

import {
  installGoogleMapsGlobal,
  makeVisGlMock,
  mapsMockState,
  resetMapsMocks,
} from "../../../_helpers/maps-mocks";
import oracle from "../oracle/follow-behavior.json" with { type: "json" };

vi.mock("@vis.gl/react-google-maps", () => makeVisGlMock());
vi.mock("@/hooks/useTheme", () => ({
  useTheme: () => ({ theme: "light", setTheme: () => {} }),
}));
vi.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({ theme: "light", setTheme: () => {} }),
}));

interface DriverLocation {
  driverId: string;
  routeId: string;
  lat: number;
  lng: number;
  speed: number;
  heading: number;
  accuracy: number;
  updatedAt: { toDate: () => Date };
}

function loc(driverId: string, lat: number, lng: number): DriverLocation {
  return {
    driverId,
    routeId: "r1",
    lat,
    lng,
    speed: 10,
    heading: 0,
    accuracy: 5,
    updatedAt: { toDate: () => new Date(0) },
  };
}

/** Run a scripted sequence of `(locations, selectedDriverId)` updates. */
async function runSequence(
  steps: Array<{
    locations: DriverLocation[];
    selectedDriverId: string | null;
  }>,
) {
  installGoogleMapsGlobal();
  resetMapsMocks();

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  const { TrackingMap } = await import(
    "../../../../src/components/maps/TrackingMap"
  );

  function Host({ step }: { step: (typeof steps)[number] }) {
    return React.createElement(
      TrackingMap as unknown as React.FC<{
        locations: DriverLocation[];
        driverNames: Record<string, string>;
        selectedDriverId: string | null;
        trail: Array<{ lat: number; lng: number }>;
      }>,
      {
        locations: step.locations,
        driverNames: {},
        selectedDriverId: step.selectedDriverId,
        trail: [],
      },
    );
  }

  for (const step of steps) {
    await act(async () => {
      root.render(React.createElement(Host, { step }));
    });
    // Allow effects to run.
    await act(async () => {
      await Promise.resolve();
    });
  }

  const calls = mapsMockState.mapCalls.slice();

  await act(async () => {
    root.unmount();
  });
  container.remove();

  return calls;
}

interface ExpectedCall {
  method: "panTo" | "setZoom";
  pos?: { lat: number; lng: number };
  zoom?: number;
}

describe("Preservation — TrackingMap follow-driver behavior", () => {
  beforeEach(() => {
    resetMapsMocks();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("[oracle] panTo + setZoom sequence matches each canonical scenario", async () => {
    for (const scenario of oracle.scenarios as Array<{
      name: string;
      steps: Array<{
        locations: Array<{ driverId: string; lat: number; lng: number }>;
        selectedDriverId: string | null;
      }>;
      expectedCalls: ExpectedCall[];
    }>) {
      const steps = scenario.steps.map((s) => ({
        locations: s.locations.map((l) => loc(l.driverId, l.lat, l.lng)),
        selectedDriverId: s.selectedDriverId,
      }));

      const calls = await runSequence(steps);

      // Project recorded calls to the projection the oracle uses.
      const projected: ExpectedCall[] = calls.map((c) => {
        if (c.method === "panTo") {
          const pos = c.args[0] as { lat: number; lng: number };
          return { method: "panTo", pos: { lat: pos.lat, lng: pos.lng } };
        }
        if (c.method === "setZoom") {
          return { method: "setZoom", zoom: c.args[0] as number };
        }
        return { method: c.method as "panTo" };
      });

      expect(projected, `scenario: ${scenario.name}`).toEqual(
        scenario.expectedCalls,
      );
    }
  });

  it("[property 3.8] for any sequence selecting a driver once, exactly one setZoom(15) is emitted at the first follow", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            lat: fc.double({ min: -20, max: 20, noNaN: true }),
            lng: fc.double({ min: -80, max: -40, noNaN: true }),
          }),
          { minLength: 1, maxLength: 8 },
        ),
        async (positions) => {
          const steps: Array<{
            locations: DriverLocation[];
            selectedDriverId: string | null;
          }> = [];
          // step 0: nothing selected
          steps.push({
            locations: [loc("d1", positions[0].lat, positions[0].lng)],
            selectedDriverId: null,
          });
          // step 1: select — triggers panTo + setZoom(15)
          steps.push({
            locations: [loc("d1", positions[0].lat, positions[0].lng)],
            selectedDriverId: "d1",
          });
          // steps 2..n: position moves while still following
          for (let i = 1; i < positions.length; i++) {
            steps.push({
              locations: [loc("d1", positions[i].lat, positions[i].lng)],
              selectedDriverId: "d1",
            });
          }

          const calls = await runSequence(steps);

          // Exactly one setZoom(15) should have been emitted.
          const setZoomCalls = calls.filter((c) => c.method === "setZoom");
          if (setZoomCalls.length !== 1) return false;
          if ((setZoomCalls[0].args[0] as number) !== 15) return false;

          // panTo must be emitted at least once per new position.
          const panCalls = calls.filter((c) => c.method === "panTo");
          // One for each step where location is defined and selected.
          return panCalls.length >= positions.length;
        },
      ),
      { numRuns: 6 },
    );
  });
});
