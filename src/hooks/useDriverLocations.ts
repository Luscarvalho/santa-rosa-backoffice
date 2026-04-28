import { useSyncExternalStore } from "react";
import { onDriverLocations } from "@/services/location.service";
import type { DriverLocation } from "@/types/location";

const EMPTY: DriverLocation[] = [];

let currentLocations: DriverLocation[] = EMPTY;
const listeners = new Set<() => void>();
let unsubscribe: (() => void) | null = null;

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);

  if (listeners.size === 1) {
    unsubscribe = onDriverLocations((locations) => {
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
    }
  };
}

function getSnapshot() {
  return currentLocations;
}

/**
 * Subscribes to Firestore `locations` collection via onSnapshot.
 * Uses useSyncExternalStore for tear-free reads.
 * Shared subscription — multiple consumers reuse the same listener.
 */
export function useDriverLocations() {
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}
