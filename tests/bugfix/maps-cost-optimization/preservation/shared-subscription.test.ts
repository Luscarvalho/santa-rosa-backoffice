/**
 * Preservation — `useDriverLocations` + `useDriverTrails` share a single
 * Firestore `onSnapshot` subscription via a listener `Set`.
 *
 * **Validates: Requirements 3.13**
 *
 * Observation-first — the current `src/hooks/useDriverLocations.ts`
 * subscribes on the first listener joining the `Set` and unsubscribes only
 * when the last listener leaves. Both hooks (`useDriverLocations` and
 * `useDriverTrails`) use the SAME `subscribe` function, so multiple
 * consumers result in at most one active Firestore listener.
 *
 * Property:
 *   ∀ trace of consumer adds/removes, while |listeners| ≥ 1:
 *     count(active onSnapshot subscribers for `/locations`) ≤ 1.
 *   And when |listeners| = 0: count = 0.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import * as React from "react";
import fc from "fast-check";

import {
  createFirestoreMockModule,
  getActiveSubscribers,
  resetFirestoreMockState,
  seedLocations,
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

/**
 * Mount a host component that may consume `useDriverLocations`,
 * `useDriverTrails`, both, or neither. Returns a `setConsumers` updater to
 * adjust which hooks the host calls; unmounting removes all.
 */
async function mountHost(
  initialConsumers: Array<"locations" | "trails">,
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  vi.resetModules();
  const { useDriverLocations, useDriverTrails } = await import(
    "../../../../src/hooks/useDriverLocations"
  );

  function HooksCaller({ consumers }: { consumers: string[] }) {
    if (consumers.includes("locations")) useDriverLocations();
    if (consumers.includes("trails")) useDriverTrails();
    return null;
  }

  function Host({ count, set }: { count: number; set: string[][] }) {
    return React.createElement(
      React.Fragment,
      null,
      ...Array.from({ length: count }, (_, i) =>
        React.createElement(HooksCaller, {
          key: i,
          consumers: set[i] ?? [],
        }),
      ),
    );
  }

  let state: string[][] = initialConsumers.map((c) => [c]);

  await act(async () => {
    root.render(
      React.createElement(Host, { count: state.length, set: state }),
    );
  });

  return {
    setConsumers: async (next: Array<Array<"locations" | "trails">>) => {
      state = next;
      await act(async () => {
        root.render(
          React.createElement(Host, { count: state.length, set: state }),
        );
      });
    },
    teardown: async () => {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe("Preservation — useDriverLocations + useDriverTrails share one subscription (3.13)", () => {
  beforeEach(() => {
    resetFirestoreMockState();
    seedLocations([]);
  });

  afterEach(() => {
    resetFirestoreMockState();
    document.body.innerHTML = "";
  });

  it("[concrete] locations hook alone ⇒ 1 active subscriber", async () => {
    const h = await mountHost(["locations"]);
    try {
      expect(getActiveSubscribers().length).toBe(1);
    } finally {
      await h.teardown();
      expect(getActiveSubscribers().length).toBe(0);
    }
  });

  it("[concrete] locations + trails in same tree ⇒ still 1 active subscriber", async () => {
    const h = await mountHost(["locations", "trails"]);
    try {
      expect(getActiveSubscribers().length).toBe(1);
    } finally {
      await h.teardown();
    }
  });

  it("[concrete] locations + trails + locations ⇒ still 1 active subscriber", async () => {
    const h = await mountHost(["locations", "trails", "locations"]);
    try {
      expect(getActiveSubscribers().length).toBe(1);
    } finally {
      await h.teardown();
    }
  });

  it("[concrete] zero consumers ⇒ 0 active subscribers", async () => {
    const h = await mountHost([]);
    try {
      expect(getActiveSubscribers().length).toBe(0);
    } finally {
      await h.teardown();
    }
  });

  it("[property] ∀ N ∈ [0,5] consumers: active subscribers = (N ≥ 1 ? 1 : 0)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.constantFrom<"locations" | "trails">("locations", "trails"),
          { maxLength: 5 },
        ),
        async (consumers) => {
          resetFirestoreMockState();
          const h = await mountHost(consumers);
          try {
            const active = getActiveSubscribers().length;
            const expected = consumers.length === 0 ? 0 : 1;
            return active === expected;
          } finally {
            await h.teardown();
            if (getActiveSubscribers().length !== 0) return false;
          }
        },
      ),
      { numRuns: 8 },
    );
  });
});
