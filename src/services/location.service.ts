import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@lib/firebase";
import { FIRESTORE_ACTIVE_ONLY } from "@/lib/env-flags";
import type { DriverLocation } from "@/types/location";

export interface DriverLocationsSourceOptions {
  activeOnly?: boolean; // default true
}

export type DriverLocationsUnsubscribe = () => void;

/**
 * Factory that returns a subscription function for driver locations.
 *
 * When `options.activeOnly === true`, the Firestore query is filtered to
 * documents where `status == "active"`, eliminating reads for inactive
 * drivers (Bug Condition C4).
 *
 * Returns `(callback) => unsubscribe`.
 */
export function createDriverLocationsSource(
  options?: DriverLocationsSourceOptions,
): (callback: (locations: DriverLocation[]) => void) => DriverLocationsUnsubscribe {
  const activeOnly = options?.activeOnly ?? true;

  const ref = activeOnly
    ? query(collection(db, "locations"), where("status", "==", "active"))
    : collection(db, "locations");

  return (callback: (locations: DriverLocation[]) => void): DriverLocationsUnsubscribe => {
    return onSnapshot(ref, (snap) => {
      const locations = snap.docs.map(
        (d) => ({ driverId: d.id, ...d.data() }) as DriverLocation,
      );
      callback(locations);
    });
  };
}

/**
 * Subscribes to real-time location updates for all drivers.
 * Returns an unsubscribe function.
 *
 * Retro-compat wrapper — delegates to `createDriverLocationsSource` with
 * the `FIRESTORE_ACTIVE_ONLY` env flag so existing consumers are unaffected.
 */
export function onDriverLocations(
  callback: (locations: DriverLocation[]) => void,
): DriverLocationsUnsubscribe {
  return createDriverLocationsSource({ activeOnly: FIRESTORE_ACTIVE_ONLY })(callback);
}
