import type { Timestamp } from "firebase/firestore";

export const UserRole = {
  Admin: "admin",
  Supervisor: "supervisor",
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export interface AppUser {
  name: string;
  email: string;
  role: UserRole;
  createdAt: Timestamp;
}
