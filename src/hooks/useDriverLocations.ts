import { useSyncExternalStore } from "react";
import { createDriverLocationsSource } from "@/services/location.service";
import { FIRESTORE_ACTIVE_ONLY } from "@/lib/env-flags";
import { simplifyPath } from "@/lib/simplify-path";
import type { DriverLocation } from "@/types/location";

type TrailPoint = { lat: number; lng: number };
type TrailsMap = Record<string, TrailPoint[]>;

// Runtime-frozen sentinel values. The types remain mutable so existing
// consumers (that accept `DriverLocation[]`) stay compatible without a wider
// refactor; any accidental `push`/`splice` at runtime throws in strict mode.
const EMPTY = Object.freeze([] as DriverLocation[]) as DriverLocation[];
const EMPTY_TRAILS = Object.freeze({} as TrailsMap) as TrailsMap;

let currentLocations: DriverLocation[] = EMPTY;
let currentTrails: TrailsMap = EMPTY_TRAILS;
const listeners = new Set<() => void>();
let unsubscribe: (() => void) | null = null;

const MAX_TRAIL_POINTS = 200;
const SIMPLIFY_THRESHOLD = 50;

// ---------------------------------------------------------------------------
// Module-level visibility tracking (mirrors useDocumentVisibility logic but
// at module scope so it integrates with the module-level subscription state).
// ---------------------------------------------------------------------------

const HIDDEN_GRACE_MS = 30_000;

/** The factory used to (re-)subscribe. Created once at module load. */
const source = createDriverLocationsSource({ activeOnly: FIRESTORE_ACTIVE_ONLY });

function onSnapshotCallback(locations: DriverLocation[]) {
  // Lazy clone: only spread currentTrails if at least one driver had a real
  // (lat, lng) change. This preserves referential identity when no coord
  // changed (P8 / Requirement 2.9).
  let hasChange = false;
  // Mutable working copy — only cloned when we detect the first real change.
  let newTrails: TrailsMap = currentTrails;

  for (const loc of locations) {
    const prev = currentTrails[loc.driverId] ?? [];
    const last = prev[prev.length - 1];
    // Only add if position actually changed
    if (!last || last.lat !== loc.lat || last.lng !== loc.lng) {
      if (!hasChange) {
        newTrails = { ...currentTrails }; // lazy clone on first real change
        hasChange = true;
      }
      const merged = [
        ...prev.slice(-MAX_TRAIL_POINTS + 1),
        { lat: loc.lat, lng: loc.lng },
      ];
      newTrails[loc.driverId] =
        merged.length > SIMPLIFY_THRESHOLD
          ? simplifyPath(merged, { toleranceMeters: 15 })
          : merged;
    }
  }

  // Always update currentLocations and notify listeners (preserves current
  // contract — listeners are notified for every snapshot, even when only
  // locations changed but trails did not).
  if (hasChange) {
    currentTrails = newTrails;
  }
  currentLocations = locations;
  listeners.forEach((l) => l());
}

function startSubscription() {
  if (unsubscribe === null && listeners.size > 0) {
    unsubscribe = source(onSnapshotCallback);
  }
}

function stopSubscription() {
  if (unsubscribe !== null) {
    unsubscribe();
    unsubscribe = null;
  }
}

// ---------------------------------------------------------------------------
// Visibility — the listener is attached on first subscribe and removed on
// last unsubscribe so:
//   - Modules reloaded by HMR don't stack handlers.
//   - Tests using `vi.resetModules()` get a clean slate without relying on
//     implicit module-singleton lifetime.
// ---------------------------------------------------------------------------

let visibilityState: "visible" | "hidden" =
  typeof document !== "undefined" && document.visibilityState === "hidden"
    ? "hidden"
    : "visible";
let hiddenGraceTimer: ReturnType<typeof setTimeout> | null = null;
let visibilityListenerAttached = false;

function clearHiddenGraceTimer() {
  if (hiddenGraceTimer !== null) {
    clearTimeout(hiddenGraceTimer);
    hiddenGraceTimer = null;
  }
}

function handleVisibilityChange() {
  const raw: "visible" | "hidden" =
    typeof document !== "undefined" && document.visibilityState === "hidden"
      ? "hidden"
      : "visible";

  if (raw === "visible") {
    // Cancel any pending hidden-flip and surface visible immediately.
    clearHiddenGraceTimer();
    if (visibilityState !== "visible") {
      visibilityState = "visible";
      // Re-subscribe if there are active listeners.
      startSubscription();
    }
    return;
  }

  // raw === "hidden": schedule the flip after the grace window.
  // Do not restart if a timer is already pending (prevents indefinite deferral).
  if (hiddenGraceTimer !== null) {
    return;
  }
  hiddenGraceTimer = setTimeout(() => {
    hiddenGraceTimer = null;
    // Re-check: only flip if still hidden when the timer fires.
    if (
      typeof document !== "undefined" &&
      document.visibilityState === "hidden"
    ) {
      visibilityState = "hidden";
      // Pause the Firestore subscription.
      // Keep currentLocations/currentTrails intact so a quick toggle
      // doesn't flash empty (requirement 3.12).
      stopSubscription();
    }
  }, HIDDEN_GRACE_MS);
}

function attachVisibilityListener() {
  if (visibilityListenerAttached) return;
  if (typeof document === "undefined") return;
  document.addEventListener("visibilitychange", handleVisibilityChange);
  visibilityListenerAttached = true;
}

function detachVisibilityListener() {
  if (!visibilityListenerAttached) return;
  if (typeof document === "undefined") return;
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  visibilityListenerAttached = false;
  clearHiddenGraceTimer();
}

// ---------------------------------------------------------------------------

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);

  if (listeners.size === 1) {
    attachVisibilityListener();
    if (visibilityState === "visible") {
      startSubscription();
    }
  }

  return () => {
    listeners.delete(onStoreChange);
    if (listeners.size === 0) {
      stopSubscription();
      detachVisibilityListener();
      currentLocations = EMPTY;
      currentTrails = EMPTY_TRAILS;
    }
  };
}

function getSnapshot(): DriverLocation[] {
  return currentLocations;
}

function getTrailsSnapshot(): TrailsMap {
  return currentTrails;
}

/**
 * Subscribes to Firestore `locations` collection via onSnapshot.
 * Uses useSyncExternalStore for tear-free reads.
 * Shared subscription — multiple consumers reuse the same listener.
 */
export function useDriverLocations(): DriverLocation[] {
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}

/** Returns accumulated trail points per driver. */
export function useDriverTrails(): TrailsMap {
  return useSyncExternalStore(subscribe, getTrailsSnapshot, () => EMPTY_TRAILS);
}
