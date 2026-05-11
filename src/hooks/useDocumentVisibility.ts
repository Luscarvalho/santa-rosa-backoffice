import { useEffect, useState } from "react";

/**
 * Public result of {@link useDocumentVisibility}. Mirrors the two states that
 * the hook exposes to consumers. Note that while `document.visibilityState`
 * can technically also report `"prerender"` / `"unloaded"`, those are
 * normalized to `"visible"` here so callers only have to reason about two
 * states.
 */
export type DocumentVisibility = "visible" | "hidden";

export interface UseDocumentVisibilityOptions {
  /**
   * Debounce window (milliseconds) applied only to `visible → hidden`
   * transitions. Flipping back to `"visible"` is always immediate, regardless
   * of this value. Default: `30000` (30 s) — matches `hidden_grace_ms` from
   * the maps-cost-optimization design.
   *
   * A value of `0` still defers the flip through `setTimeout` so the state
   * update always happens asynchronously, keeping consumer behavior
   * consistent regardless of the grace window.
   */
  hiddenGraceMs?: number;
}

const DEFAULT_HIDDEN_GRACE_MS = 30_000;

/**
 * Reads the raw visibility of `document`. `"hidden"` is returned only when
 * the Page Visibility API explicitly reports the page as hidden; anything
 * else (including environments without `document`, e.g. SSR or node-based
 * tests) is treated as `"visible"` so consumers never start in a paused
 * state.
 */
function readRawVisibility(): DocumentVisibility {
  if (typeof document === "undefined") {
    return "visible";
  }
  return document.visibilityState === "hidden" ? "hidden" : "visible";
}

/**
 * Observes `document.visibilityState` and reports it with a configurable
 * debounce on the `visible → hidden` edge.
 *
 * Behavior:
 * - Initial state: reflects the current `document.visibilityState` (so if the
 *   page mounts already hidden, the hook returns `"hidden"` right away — no
 *   debounce on initial read).
 * - `visible → hidden`: a pending `setTimeout(hiddenGraceMs)` is scheduled;
 *   the state flips to `"hidden"` only if the timer fires without being
 *   canceled. A grace of `0` still defers through `setTimeout` to keep the
 *   update asynchronous and prevent surprising synchronous notifications
 *   from `visibilitychange` handlers.
 * - `hidden → visible`: any pending hidden-flip timer is canceled and the
 *   state flips to `"visible"` immediately.
 * - Cleanup on unmount clears any pending timer and removes the
 *   `visibilitychange` listener.
 *
 * Used by `useDriverLocations` (task 8.2) to pause the Firestore `locations`
 * subscription when the tab has been hidden past the grace window, avoiding
 * flapping on quick minimize/restore cycles.
 */
export function useDocumentVisibility(
  options?: UseDocumentVisibilityOptions,
): DocumentVisibility {
  const hiddenGraceMs = options?.hiddenGraceMs ?? DEFAULT_HIDDEN_GRACE_MS;

  const [visibility, setVisibility] = useState<DocumentVisibility>(() =>
    readRawVisibility(),
  );

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    let pendingHiddenTimer: ReturnType<typeof setTimeout> | null = null;

    const clearPendingHiddenTimer = () => {
      if (pendingHiddenTimer !== null) {
        clearTimeout(pendingHiddenTimer);
        pendingHiddenTimer = null;
      }
    };

    const handleVisibilityChange = () => {
      const raw = readRawVisibility();

      if (raw === "visible") {
        // Always cancel any pending hidden flip and surface visible
        // immediately — hidden→visible never debounces.
        clearPendingHiddenTimer();
        setVisibility((prev) => (prev === "visible" ? prev : "visible"));
        return;
      }

      // raw === "hidden": schedule the flip after the grace window.
      // If a timer is already pending we keep it (do not restart) so that
      // rapid visible/hidden/visible/hidden flaps cannot indefinitely
      // postpone the emission beyond the first hidden edge.
      if (pendingHiddenTimer !== null) {
        return;
      }
      pendingHiddenTimer = setTimeout(() => {
        pendingHiddenTimer = null;
        // Re-check: only flip if the document is still hidden when the
        // timer fires. A visible transition would have canceled this
        // timer already, but we guard against drift just in case.
        if (readRawVisibility() === "hidden") {
          setVisibility((prev) => (prev === "hidden" ? prev : "hidden"));
        }
      }, hiddenGraceMs);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearPendingHiddenTimer();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [hiddenGraceMs]);

  return visibility;
}
