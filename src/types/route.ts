import type { Timestamp } from "firebase/firestore";

export const RouteStatus = {
  Pending: "pending",
  Active: "active",
  Completed: "completed",
  Cancelled: "cancelled",
} as const;

export type RouteStatus = (typeof RouteStatus)[keyof typeof RouteStatus];

export interface Route {
  id: string;
  name: string;
  driverId: string;
  vehicleId: string;
  status: RouteStatus;
  startedAt: Timestamp | null;
  completedAt: Timestamp | null;
  totalDeliveries: number;
  completedDeliveries: number;
  estimatedDistance: number;
  notes: string;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp | null;
}
