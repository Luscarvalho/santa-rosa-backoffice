/**
 * C5 — Bug Condition: the Firestore locations listener stays subscribed while
 * the tab is hidden, continuing to bill document reads with no visible
 * consumer.
 *
 * **Validates: Requirements 2.8**
 *
 * The current implementation in `src/hooks/useDriverLocations.ts` subscribes
 * on the first listener and only unsubscribes when the last listener leaves.
 * It never observes `document.visibilityState`.
 *
 * Property (from tasks.md §1 C5):
 *   ∀ interval with visibility = "hidden" ∧ Δt > 30000ms:
 *     active_listeners.locations = 0
 *
 * EXPECTED IN F: after emitting `visibilitychange → hidden` and advancing
 * the clock beyond 30_000 ms, the mock's active subscriber set is still
 * non-empty. The property fails.
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
} from "../../_helpers/firestore-mocks";
import { setVisibility, resetVisibility } from "../../_helpers/visibility-mocks";

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

async function mountConsumer() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  // Fresh import so the module's internal `listeners` / `unsubscribe` state
  // is re-initialized relative to the current vi.mock.
  vi.resetModules();
  const { useDriverLocations } = await import(
    "../../../src/hooks/useDriverLocations"
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

/**
 * Check: after this much wall-clock time with the tab hidden, is the Firestore
 * listener still active?
 *
 * The property we're asserting — from bugfix.md — says that after
 * `hidden_duration_ms > 30000`, `active_snapshot_listeners.locations = 0`.
 */
async function wasListenerPausedAfterHidden(hiddenForMs: number) {
  vi.useFakeTimers();
  try {
    resetFirestoreMockState();
    seedLocations([
      { id: "d1", driverId: "d1", routeId: "r1", lat: 0, lng: 0, status: "active" },
    ]);

    const teardown = await mountConsumer();
    try {
      // Listener should be active right after mount (hook subscribed).
      const activeBefore = getActiveSubscribers().length;
      if (activeBefore === 0) {
        // Hook didn't subscribe — skip, not a failure.
        return { activeBefore, activeAfter: 0, skipped: true as const };
      }

      // Emit visibilitychange → hidden, then advance the clock.
      setVisibility("hidden");
      await act(async () => {
        vi.advanceTimersByTime(hiddenForMs);
        await Promise.resolve();
      });

      const activeAfter = getActiveSubscribers().length;
      return { activeBefore, activeAfter, skipped: false as const };
    } finally {
      await teardown();
    }
  } finally {
    resetVisibility();
    vi.useRealTimers();
  }
}

describe("C5 — Listener still active while tab hidden > 30s (BUG EXPLORATION)", () => {
  beforeEach(() => {
    resetFirestoreMockState();
    resetVisibility();
  });

  afterEach(() => {
    resetFirestoreMockState();
    resetVisibility();
    vi.useRealTimers();
  });

  it("[concrete] hidden for 31_000ms ⇒ active listener count must be 0", async () => {
    const { activeAfter, skipped } = await wasListenerPausedAfterHidden(31_000);
    // In F the hook never observes visibilitychange, so this assertion fails.
    // In F' it should pass.
    if (!skipped) expect(activeAfter).toBe(0);
  });

  it("[property] ∀ hiddenForMs > 30_000: active listener count SHALL be 0", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 30_001, max: 10 * 60_000 }),
        async (hiddenForMs) => {
          const result = await wasListenerPausedAfterHidden(hiddenForMs);
          if (result.skipped) return true;
          return result.activeAfter === 0;
        },
      ),
      { numRuns: 5 },
    );
  });
});
