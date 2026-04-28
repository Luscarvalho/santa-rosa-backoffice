import type { Timestamp } from "firebase/firestore";

export const VehicleStatus = {
  Available: "available",
  InUse: "in_use",
  Maintenance: "maintenance",
} as const;

export type VehicleStatus = (typeof VehicleStatus)[keyof typeof VehicleStatus];

export interface Vehicle {
  id: string;
  plate: string;
  model: string;
  year: number;
  capacity: number;
  status: VehicleStatus;
  currentDriverId: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp | null;
}
