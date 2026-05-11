/**
 * Helpers to drive document.visibilityState + `visibilitychange` event.
 *
 * jsdom exposes `document.visibilityState` as a read-only getter, so we replace
 * it with a configurable property on the prototype for the duration of the
 * test.
 */

export function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => state === "hidden",
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

export function resetVisibility() {
  setVisibility("visible");
}
