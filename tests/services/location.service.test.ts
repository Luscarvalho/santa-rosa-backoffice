/**
 * Tests for `createDriverLocationsSource` — active-only filter (P4).
 *
 * **Validates: Requirements 2.7**
 *
 * Unit tests verify that the factory builds the correct Firestore query
 * depending on the `activeOnly` option.
 *
 * Integration test seeds {active:3, inactive:50} and verifies only 3 docs
 * are delivered to the callback when `activeOnly: true`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type LocationDoc,
  createFirestoreMockModule,
  getActiveSubscribers,
  resetFirestoreMockState,
  seedLocations,
} from "../_helpers/firestore-mocks";

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

describe("createDriverLocationsSource — unit: query shape", () => {
  beforeEach(() => {
    resetFirestoreMockState();
  });

  afterEach(() => {
    resetFirestoreMockState();
  });

  it("activeOnly:true — query includes where('status','==','active') filter", async () => {
    const { createDriverLocationsSource } = await import(
      "../../src/services/location.service"
    );

    // Seed mixed docs so we can observe filtering
    seedLocations(makeSeed(2, 5));

    const captured: LocationDoc[][] = [];
    const source = createDriverLocationsSource({ activeOnly: true });
    const unsub = source((locs) => {
      captured.push(locs as unknown as LocationDoc[]);
    });
    await Promise.resolve();
    unsub();

    // The subscriber registered with the mock should have a where filter
    // for status == "active"
    const subs = getActiveSubscribers();
    // After unsub, subscriber is removed — check via captured data instead
    // The delivered docs should all be active
    expect(captured[0]).toBeDefined();
    expect(captured[0]!.every((d) => d.status === "active")).toBe(true);
    // And only the active ones were delivered (2 active, 5 inactive)
    expect(captured[0]!.length).toBe(2);
  });

  it("activeOnly:false — query has no where filter, delivers all docs", async () => {
    const { createDriverLocationsSource } = await import(
      "../../src/services/location.service"
    );

    seedLocations(makeSeed(2, 5));

    const captured: LocationDoc[][] = [];
    const source = createDriverLocationsSource({ activeOnly: false });
    const unsub = source((locs) => {
      captured.push(locs as unknown as LocationDoc[]);
    });
    await Promise.resolve();
    unsub();

    // Without filter, all 7 docs are delivered
    expect(captured[0]).toBeDefined();
    expect(captured[0]!.length).toBe(7);
  });

  it("activeOnly defaults to true when option is omitted", async () => {
    const { createDriverLocationsSource } = await import(
      "../../src/services/location.service"
    );

    seedLocations(makeSeed(3, 10));

    const captured: LocationDoc[][] = [];
    const source = createDriverLocationsSource(); // no options
    const unsub = source((locs) => {
      captured.push(locs as unknown as LocationDoc[]);
    });
    await Promise.resolve();
    unsub();

    // Default activeOnly=true: only 3 active docs
    expect(captured[0]!.length).toBe(3);
    expect(captured[0]!.every((d) => d.status === "active")).toBe(true);
  });
});

describe("createDriverLocationsSource — integration: seed {active:3, inactive:50}", () => {
  beforeEach(() => {
    resetFirestoreMockState();
  });

  afterEach(() => {
    resetFirestoreMockState();
  });

  it("only 3 docs delivered to callback when activeOnly:true", async () => {
    const { createDriverLocationsSource } = await import(
      "../../src/services/location.service"
    );

    seedLocations(makeSeed(3, 50));

    const delivered: LocationDoc[][] = [];
    const source = createDriverLocationsSource({ activeOnly: true });
    const unsub = source((locs) => {
      delivered.push(locs as unknown as LocationDoc[]);
    });
    await Promise.resolve();
    unsub();

    expect(delivered[0]).toBeDefined();
    expect(delivered[0]!.length).toBe(3);
    for (const doc of delivered[0]!) {
      expect(doc.status).toBe("active");
    }
  });

  it("all 53 docs delivered when activeOnly:false", async () => {
    const { createDriverLocationsSource } = await import(
      "../../src/services/location.service"
    );

    seedLocations(makeSeed(3, 50));

    const delivered: LocationDoc[][] = [];
    const source = createDriverLocationsSource({ activeOnly: false });
    const unsub = source((locs) => {
      delivered.push(locs as unknown as LocationDoc[]);
    });
    await Promise.resolve();
    unsub();

    expect(delivered[0]!.length).toBe(53);
  });
});
