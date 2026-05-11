/**
 * Preservation — Trail shape within 15 m Hausdorff of the raw captured trail.
 *
 * **Validates: Requirements 3.9** (combines with P7)
 *
 * Observation-first — F accumulates trails in `src/hooks/useDriverLocations.ts`
 * with no simplification. F' is allowed to apply Douglas-Peucker at tolerance
 * 15 m. Preservation property (loose-enough to admit simplification but
 * tight-enough to catch regressions):
 *
 *   Let raw = the sequence of distinct `(lat,lng)` pairs actually delivered
 *   by Firestore for a single driver (derived from the seeded updates).
 *   Then for the trail T emitted by `useDriverTrails()[driverId]`:
 *     1. T is an ORDERED SUBSEQUENCE of raw.
 *     2. first(T) = first(raw) ∧ last(T) = last(raw).
 *     3. Hausdorff(raw, T) ≤ 15 m.
 *
 * On F, T = raw, so all three hold trivially (subsequence = identity, endpoints
 * match, Hausdorff = 0). On F', T ⊊ raw when length > SIMPLIFY_THRESHOLD, and
 * the three invariants still hold by construction of simplifyPath.
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

type LatLng = { lat: number; lng: number };

function makeDoc(driverId: string, lat: number, lng: number): LocationDoc {
  return {
    id: driverId,
    driverId,
    routeId: "r1",
    lat,
    lng,
    speed: 5,
    heading: 0,
    accuracy: 5,
    status: "active",
  };
}

/** Great-circle distance in meters using the equirectangular approximation
 * — good enough for short polylines and matches the design's tolerance
 * semantics. */
function haversine(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Perpendicular distance from p to segment ab — in meters. */
function distanceToSegment(p: LatLng, a: LatLng, b: LatLng): number {
  if (a.lat === b.lat && a.lng === b.lng) return haversine(p, a);
  // Treat as flat Cartesian with equirectangular scaling for short legs.
  const meanLat = ((a.lat + b.lat) / 2 / 180) * Math.PI;
  const xScale = 111320 * Math.cos(meanLat);
  const yScale = 110540;
  const ax = a.lng * xScale;
  const ay = a.lat * yScale;
  const bx = b.lng * xScale;
  const by = b.lat * yScale;
  const px = p.lng * xScale;
  const py = p.lat * yScale;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  const ex = px - cx;
  const ey = py - cy;
  return Math.sqrt(ex * ex + ey * ey);
}

/** One-way Hausdorff: for each point of A, min distance to polyline B. */
function oneWayHausdorff(A: LatLng[], B: LatLng[]): number {
  if (A.length === 0) return 0;
  if (B.length === 0) return Infinity;
  let maxMin = 0;
  for (const a of A) {
    let minDist = Infinity;
    if (B.length === 1) {
      minDist = haversine(a, B[0]);
    } else {
      for (let i = 0; i < B.length - 1; i++) {
        const d = distanceToSegment(a, B[i], B[i + 1]);
        if (d < minDist) minDist = d;
      }
    }
    if (minDist > maxMin) maxMin = minDist;
  }
  return maxMin;
}

function hausdorff(A: LatLng[], B: LatLng[]): number {
  return Math.max(oneWayHausdorff(A, B), oneWayHausdorff(B, A));
}

function isOrderedSubsequence(candidate: LatLng[], reference: LatLng[]): boolean {
  let i = 0;
  for (const p of reference) {
    if (i >= candidate.length) break;
    if (candidate[i].lat === p.lat && candidate[i].lng === p.lng) i++;
  }
  return i === candidate.length;
}

/**
 * Deliver a scripted sequence of position updates for a single driver, and
 * return both the raw trail (distinct coords seen) and the trail observed
 * via `useDriverTrails`.
 */
async function runTrail(driverId: string, path: LatLng[]) {
  vi.resetModules();
  const { useDriverLocations, useDriverTrails } = await import(
    "../../../../src/hooks/useDriverLocations"
  );

  let lastTrail: LatLng[] = [];
  function Host() {
    useDriverLocations();
    const t = useDriverTrails();
    lastTrail = t[driverId] ?? [];
    return null;
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  resetFirestoreMockState();

  await act(async () => {
    root.render(React.createElement(Host));
  });

  // De-duplicate consecutive equal points — F's hook only adds when position
  // actually changes; we mirror that for the raw reference.
  const raw: LatLng[] = [];
  for (const p of path) {
    const last = raw[raw.length - 1];
    if (!last || last.lat !== p.lat || last.lng !== p.lng) raw.push(p);
  }

  for (const p of raw) {
    await act(async () => {
      seedLocations([makeDoc(driverId, p.lat, p.lng)]);
    });
  }

  await act(async () => {
    root.unmount();
  });
  container.remove();

  return { raw, observed: lastTrail };
}

describe("Preservation — trail shape (Hausdorff ≤ 15m) P7 (3.9)", () => {
  beforeEach(() => {
    resetFirestoreMockState();
  });

  afterEach(() => {
    resetFirestoreMockState();
    document.body.innerHTML = "";
  });

  it("[concrete] straight-line path of 10 points ⇒ observed is a subsequence with endpoints preserved and Hausdorff = 0", async () => {
    const path: LatLng[] = Array.from({ length: 10 }, (_, i) => ({
      lat: -3.1 - i * 0.0001,
      lng: -60.02 + i * 0.0001,
    }));
    const { raw, observed } = await runTrail("d1", path);
    expect(observed.length).toBeGreaterThan(0);
    expect(isOrderedSubsequence(observed, raw)).toBe(true);
    expect(observed[0]).toEqual(raw[0]);
    expect(observed[observed.length - 1]).toEqual(raw[raw.length - 1]);
    expect(hausdorff(raw, observed)).toBeLessThanOrEqual(15);
  });

  it("[property] ∀ short paths (≤60 pts around Manaus): observed trail is subsequence of raw ∧ endpoints preserved ∧ Hausdorff ≤ 15m", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            // Bounded around Manaus; step size ~1m at this latitude
            // (0.00001° ≈ 1.1 m), so 60 points ≈ 60–70 m of path.
            dLat: fc.integer({ min: -10, max: 10 }),
            dLng: fc.integer({ min: -10, max: 10 }),
          }),
          { minLength: 2, maxLength: 60 },
        ),
        async (deltas) => {
          const path: LatLng[] = [];
          let lat = -3.119;
          let lng = -60.021;
          for (const d of deltas) {
            lat += d.dLat * 0.00001;
            lng += d.dLng * 0.00001;
            path.push({ lat, lng });
          }
          const { raw, observed } = await runTrail("dX", path);
          if (observed.length === 0) return raw.length === 0;
          if (!isOrderedSubsequence(observed, raw)) return false;
          if (
            observed[0].lat !== raw[0].lat ||
            observed[0].lng !== raw[0].lng
          )
            return false;
          const lastR = raw[raw.length - 1];
          const lastO = observed[observed.length - 1];
          if (lastO.lat !== lastR.lat || lastO.lng !== lastR.lng) return false;
          return hausdorff(raw, observed) <= 15;
        },
      ),
      { numRuns: 6 },
    );
  });
});
