import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@lib/firebase";
import type { DriverLocation } from "@/types/location";

const ref = collection(db, "locations");

/**
 * Subscribes to real-time location updates for all drivers.
 * Returns an unsubscribe function.
 */
export function onDriverLocations(
  callback: (locations: DriverLocation[]) => void,
): () => void {
  return onSnapshot(ref, (snap) => {
    const locations = snap.docs.map(
      (d) => ({ driverId: d.id, ...d.data() }) as DriverLocation,
    );
    callback(locations);
  });
}
