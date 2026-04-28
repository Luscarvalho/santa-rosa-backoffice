import type { Timestamp } from "firebase/firestore";

export interface DriverLocation {
  driverId: string;
  routeId: string;
  lat: number;
  lng: number;
  speed: number;
  heading: number;
  accuracy: number;
  updatedAt: Timestamp;
}
