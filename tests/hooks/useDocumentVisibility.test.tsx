/**
 * Unit + property-based tests for `useDocumentVisibility`.
 *
 * The hook debounces `visible → hidden` transitions through a
 * `hiddenGraceMs` window (default 30 000 ms) and flips to `"visible"`
 * immediately on any `hidden → visible` edge. Tests run under fake timers
 * so the grace window is deterministic.
 *
 * **Validates: P5 (base)** — foundation for the "listener paused when
 * hidden > grace" correctness property. See
 * `.kiro/specs/maps-cost-optimization/design.md` §Correctness Properties
 * P5 and task 5.3 in `tasks.md`.
 *
 * Requirements covered: 2.8 (tab hidden past `hidden_grace_ms` ⇒ listener
 * paused; the hook is the primitive the Firestore listener consumes).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, act } from "@testing-library/react";
import * as React from "react";
import fc from "fast-check";

import { useDocumentVisibility } from "@/hooks/useDocumentVisibility";
import {
  setVisibility,
  resetVisibility,
} from "../_helpers/visibility-mocks";

const GRACE = 30_000;

/**
 * Minimal host component that renders the current `useDocumentVisibility`
 * value into a DOM node queryable by Testing Library. Using a data-testid
 * avoids coupling the assertions to any particular className or layout.
 */
function Host({ hiddenGraceMs = GRACE }: { hiddenGraceMs?: number }) {
  const value = useDocumentVisibility({ hiddenGraceMs });
  return React.createElement("div", { "data-testid": "v" }, value);
}

describe("useDocumentVisibility", () => {
  beforeEach(() => {
    // Fake timers let us drive the grace setTimeout exactly; resetVisibility
    // makes sure each test starts from a known "visible" baseline.
    vi.useFakeTimers();
    resetVisibility();
  });

  afterEach(() => {
    resetVisibility();
    vi.useRealTimers();
  });

  // ───────────────────────────────────────────────────────────────────────
  // Unit tests (explicit scenarios from task 5.3)
  // ───────────────────────────────────────────────────────────────────────

  describe("unit", () => {
    it("visible → hidden → (< grace) → visible never emits hidden", () => {
      const { getByTestId } = render(<Host hiddenGraceMs={GRACE} />);
      expect(getByTestId("v").textContent).toBe("visible");

      act(() => {
        setVisibility("hidden");
      });
      // Advance just below the grace window — timer must not fire yet.
      act(() => {
        vi.advanceTimersByTime(GRACE - 1);
      });
      expect(getByTestId("v").textContent).toBe("visible");

      // Flip back to visible before the grace elapses — cancels the timer.
      act(() => {
        setVisibility("visible");
      });
      expect(getByTestId("v").textContent).toBe("visible");

      // And it stays visible even well past the original grace deadline.
      act(() => {
        vi.advanceTimersByTime(GRACE * 2);
      });
      expect(getByTestId("v").textContent).toBe("visible");
    });

    it("visible → hidden → (> grace) emits hidden", () => {
      const { getByTestId } = render(<Host hiddenGraceMs={GRACE} />);
      expect(getByTestId("v").textContent).toBe("visible");

      act(() => {
        setVisibility("hidden");
      });
      // Still visible right before the deadline.
      act(() => {
        vi.advanceTimersByTime(GRACE - 1);
      });
      expect(getByTestId("v").textContent).toBe("visible");

      // Crossing the grace boundary flips the emitted state to hidden.
      act(() => {
        vi.advanceTimersByTime(2);
      });
      expect(getByTestId("v").textContent).toBe("hidden");
    });

    it("hidden (pending) → visible cancels the timer and flips immediately", () => {
      const { getByTestId } = render(<Host hiddenGraceMs={GRACE} />);

      act(() => {
        setVisibility("hidden");
      });
      act(() => {
        vi.advanceTimersByTime(5_000);
      });
      // Timer still pending, state unchanged.
      expect(getByTestId("v").textContent).toBe("visible");

      act(() => {
        setVisibility("visible");
      });
      // Immediate flip; no debounce on the visible edge.
      expect(getByTestId("v").textContent).toBe("visible");

      // Waiting past the original grace must not resurrect the hidden flip.
      act(() => {
        vi.advanceTimersByTime(GRACE * 2);
      });
      expect(getByTestId("v").textContent).toBe("visible");
    });

    it("initial mount while document.visibilityState === 'hidden' starts as hidden", () => {
      // Mount after the document is already hidden: the hook's initial
      // useState reads the raw value so no debounce applies here.
      setVisibility("hidden");
      const { getByTestId } = render(<Host hiddenGraceMs={GRACE} />);
      expect(getByTestId("v").textContent).toBe("hidden");
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // Property-based tests (grace invariant)
  // ───────────────────────────────────────────────────────────────────────

  describe("PBT — grace invariant", () => {
    /**
     * Event generator: a bounded trace of `{type, dtMs}` toggles.
     * Short traces (`maxLength: 8`) keep the test fast and robust under
     * fake timers.
     */
    const eventArb = fc.array(
      fc.record({
        type: fc.constantFrom<"visible" | "hidden">("visible", "hidden"),
        dtMs: fc.integer({ min: 0, max: 120_000 }),
      }),
      { maxLength: 8 },
    );

    it("final state matches a reference simulator over arbitrary event sequences", () => {
      fc.assert(
        fc.property(eventArb, (events) => {
          // Fresh environment per iteration.
          resetVisibility();
          vi.clearAllTimers();

          // Reference simulator that encodes the hook's contract:
          //   - `visible → hidden`: schedule a timer at now + grace *only if*
          //     no timer is already pending (matches the hook's "keep the
          //     existing timer" behavior).
          //   - Timer firing flips state to "hidden" iff the raw state is
          //     still hidden at fire time.
          //   - Any `visible` event cancels the pending timer and flips
          //     state to "visible" immediately.
          let simRaw: "visible" | "hidden" = "visible";
          let simEmitted: "visible" | "hidden" = "visible";
          let simPendingFiresAt: number | null = null;
          let simNow = 0;

          const simTick = (dt: number) => {
            const target = simNow + dt;
            if (
              simPendingFiresAt !== null &&
              target >= simPendingFiresAt
            ) {
              // Timer fires at exactly its scheduled time.
              simNow = simPendingFiresAt;
              simPendingFiresAt = null;
              if (simRaw === "hidden") {
                simEmitted = "hidden";
              }
            }
            simNow = target;
          };

          const simEvent = (type: "visible" | "hidden") => {
            simRaw = type;
            if (type === "visible") {
              simPendingFiresAt = null;
              simEmitted = "visible";
              return;
            }
            // type === "hidden"
            if (simPendingFiresAt === null) {
              simPendingFiresAt = simNow + GRACE;
            }
          };

          const { getByTestId, unmount } = render(
            <Host hiddenGraceMs={GRACE} />,
          );

          try {
            for (const e of events) {
              // Advance first so any pending timer fires before we handle
              // the next visibilitychange — matches the ordering used by
              // the browser under vi.advanceTimersByTime().
              act(() => {
                vi.advanceTimersByTime(e.dtMs);
              });
              simTick(e.dtMs);

              act(() => {
                setVisibility(e.type);
              });
              simEvent(e.type);
            }

            const actual = getByTestId("v").textContent;
            return actual === simEmitted;
          } finally {
            unmount();
          }
        }),
        { numRuns: 10 },
      );
    });

    it("safety: emitted is 'visible' when raw is visible and never 'hidden' within grace of last hidden edge", () => {
      fc.assert(
        fc.property(eventArb, (events) => {
          resetVisibility();
          vi.clearAllTimers();

          const { getByTestId, unmount } = render(
            <Host hiddenGraceMs={GRACE} />,
          );

          try {
            // `hiddenStart` is the instant at which the current continuous
            // hidden span started (null when raw === "visible"). Reset on
            // every visible edge so a quick visible/hidden flap starts a
            // fresh grace window.
            let now = 0;
            let hiddenStart: number | null = null;
            let rawHidden = false;

            for (const e of events) {
              act(() => {
                vi.advanceTimersByTime(e.dtMs);
              });
              now += e.dtMs;

              act(() => {
                setVisibility(e.type);
              });
              if (e.type === "visible") {
                rawHidden = false;
                hiddenStart = null;
              } else {
                rawHidden = true;
                if (hiddenStart === null) hiddenStart = now;
              }

              const emitted = getByTestId("v").textContent;

              // Invariant 1: raw visible ⇒ emitted visible
              //              (hidden → visible has zero debounce).
              if (!rawHidden && emitted !== "visible") return false;

              // Invariant 2: emitted hidden ⇒ continuous hidden span ≥ GRACE.
              if (
                emitted === "hidden" &&
                (hiddenStart === null || now - hiddenStart < GRACE)
              ) {
                return false;
              }
            }
            return true;
          } finally {
            unmount();
          }
        }),
        { numRuns: 10 },
      );
    });
  });
});
