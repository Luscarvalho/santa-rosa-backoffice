import { useSyncExternalStore } from "react";
import { onDriverLocations } from "@/services/location.service";
import type { DriverLocation } from "@/types/location";

const EMPTY: DriverLocation[] = [];
const EMPTY_TRAILS: Record<string, Array<{ lat: number; lng: number }>> = {};

let currentLocations: DriverLocation[] = EMPTY;
let currentTrails: Record<
  string,
  Array<{ lat: number; lng: number }>
> = EMPTY_TRAILS;
const listeners = new Set<() => void>();
let unsubscribe: (() => void) | null = null;

const MAX_TRAIL_POINTS = 200;

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);

  if (listeners.size === 1) {
    unsubscribe = onDriverLocations((locations) => {
      // Accumulate trail points
      const newTrails = { ...currentTrails };
      for (const loc of locations) {
        const trail = newTrails[loc.driverId] ?? [];
        const last = trail[trail.length - 1];
        // Only add if position actually changed
        if (!last || last.lat !== loc.lat || last.lng !== loc.lng) {
          newTrails[loc.driverId] = [
            ...trail.slice(-MAX_TRAIL_POINTS + 1),
            { lat: loc.lat, lng: loc.lng },
          ];
        }
      }
      currentTrails = newTrails;
      currentLocations = locations;
      listeners.forEach((l) => l());
    });
  }

  return () => {
    listeners.delete(onStoreChange);
    if (listeners.size === 0 && unsubscribe) {
      unsubscribe();
      unsubscribe = null;
      currentLocations = EMPTY;
      currentTrails = EMPTY_TRAILS;
    }
  };
}

function getSnapshot() {
  return currentLocations;
}

function getTrailsSnapshot() {
  return currentTrails;
}

/**
 * Subscribes to Firestore `locations` collection via onSnapshot.
 * Uses useSyncExternalStore for tear-free reads.
 * Shared subscription — multiple consumers reuse the same listener.
 */
export function useDriverLocations() {
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}

/** Returns accumulated trail points per driver. */
export function useDriverTrails() {
  return useSyncExternalStore(subscribe, getTrailsSnapshot, () => EMPTY_TRAILS);
}
