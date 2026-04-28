import type { Timestamp } from "firebase/firestore";

export const DriverStatus = {
  Available: "available",
  OnRoute: "on_route",
  Offline: "offline",
} as const;

export type DriverStatus = (typeof DriverStatus)[keyof typeof DriverStatus];

export interface Driver {
  id: string;
  name: string;
  email: string;
  phone: string;
  licenseNumber: string;
  licenseExpiry: Timestamp;
  vehicleId: string | null;
  status: DriverStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp | null;
}
