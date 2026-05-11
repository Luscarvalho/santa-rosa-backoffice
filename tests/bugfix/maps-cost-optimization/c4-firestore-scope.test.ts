/**
 * C4 — Bug Condition: Firestore `onSnapshot(collection(db, "locations"))` is
 * subscribed WITHOUT a `where("status","==","active")` filter, so every
 * document in /locations is streamed to every logged-in panel user,
 * including drivers that are offline/inactive.
 *
 * **Validates: Requirements 2.7**
 *
 * Property (from tasks.md §1 C4):
 *   Seed `{active:3, inactive:50}` docs.
 *   Property: ∀ doc ∈ delivered snapshot: doc.status = "active".
 *
 * EXPECTED IN F: the delivered snapshot contains all 53 docs. The property
 * fails on any doc where status ≠ "active".
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fc from "fast-check";

import {
  type LocationDoc,
  createFirestoreMockModule,
  resetFirestoreMockState,
  seedLocations,
} from "../../_helpers/firestore-mocks";

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

/** Runs one capture of the subscription callback with activeOnly:true. */
async function subscribeAndCapture() {
  // Use createDriverLocationsSource with activeOnly:true directly so the
  // test validates the fixed behavior regardless of the FIRESTORE_ACTIVE_ONLY
  // env flag (which defaults to false in tests for safe rollout).
  const { createDriverLocationsSource } = await import(
    "../../../src/services/location.service"
  );

  const captures: LocationDoc[][] = [];
  const source = createDriverLocationsSource({ activeOnly: true });
  const unsubscribe = source((locations) => {
    captures.push(locations as unknown as LocationDoc[]);
  });
  // First delivery is synchronous from our mock. Allow any queued
  // microtasks to settle before unsubscribing.
  await Promise.resolve();
  unsubscribe();
  // Return the first delivered snapshot.
  return captures[0] ?? [];
}

function makeSeed(active: number, inactive: number): LocationDoc[] {
  const out: LocationDoc[] = [];
  for (let i = 0; i < active; i++) {
    out.push({
      id: `active-${i}`,
      driverId: `active-${i}`,
      routeId: "r1",
      lat: -3.1,
      lng: -60,
      speed: 10,
      heading: 0,
      accuracy: 5,
      status: "active",
    });
  }
  for (let i = 0; i < inactive; i++) {
    out.push({
      id: `inactive-${i}`,
      driverId: `inactive-${i}`,
      routeId: "r1",
      lat: -3.1,
      lng: -60,
      speed: 0,
      heading: 0,
      accuracy: 5,
      status: "inactive",
    });
  }
  return out;
}

describe("C4 — Firestore snapshot includes non-active docs (BUG EXPLORATION)", () => {
  beforeEach(() => {
    resetFirestoreMockState();
  });

  afterEach(() => {
    resetFirestoreMockState();
  });

  it("[concrete] {active:3, inactive:50} ⇒ delivered snapshot contains only active docs", async () => {
    seedLocations(makeSeed(3, 50));
    const delivered = await subscribeAndCapture();

    // In F, `onSnapshot(collection(db, "locations"))` has no where() filter,
    // so this mock delivers all 53 documents — the property fails.
    expect(delivered.length).toBe(3);
    for (const doc of delivered) {
      expect(doc.status).toBe("active");
    }
  });

  it("[property] ∀ seed with active+inactive mix ⇒ every delivered doc has status = 'active'", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.nat({ max: 10 }),
        fc.nat({ max: 50 }),
        async (active, inactive) => {
          resetFirestoreMockState();
          seedLocations(makeSeed(active, inactive));
          const delivered = await subscribeAndCapture();
          return delivered.every((d) => d.status === "active");
        },
      ),
      { numRuns: 15 },
    );
  });
});
