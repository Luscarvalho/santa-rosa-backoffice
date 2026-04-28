import type { Timestamp } from "firebase/firestore";

export const DeliveryStatus = {
  Pending: "pending",
  InProgress: "in_progress",
  Delivered: "delivered",
  Failed: "failed",
} as const;

export type DeliveryStatus =
  (typeof DeliveryStatus)[keyof typeof DeliveryStatus];

export const FailureReason = {
  CustomerAbsent: "customer_absent",
  WrongAddress: "wrong_address",
  Refused: "refused",
  Other: "other",
} as const;

export type FailureReason = (typeof FailureReason)[keyof typeof FailureReason];

export interface DeliveryAddress {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  lat: number | null;
  lng: number | null;
}

export interface Delivery {
  id: string;
  order: number;
  recipientName: string;
  address: DeliveryAddress;
  status: DeliveryStatus;
  deliveredAt: Timestamp | null;
  deliveryPhoto: string | null;
  recipientSignature: string | null;
  notes: string;
  failureReason: FailureReason | null;
  attempts: number;
  createdAt: Timestamp;
  updatedAt: Timestamp | null;
}
