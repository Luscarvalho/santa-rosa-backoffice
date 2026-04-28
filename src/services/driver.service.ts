import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@lib/firebase";
import type { Driver } from "@/types/driver";

const ref = collection(db, "drivers");

export async function getDrivers(): Promise<Driver[]> {
  const snap = await getDocs(ref);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Driver);
}

export async function getDriver(id: string): Promise<Driver | null> {
  const snap = await getDoc(doc(ref, id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Driver) : null;
}

export async function createDriver(
  data: Omit<Driver, "id" | "createdAt" | "updatedAt" | "fcmToken">,
): Promise<void> {
  await addDoc(ref, {
    ...data,
    fcmToken: null,
    createdAt: serverTimestamp(),
    updatedAt: null,
  });
}

export async function updateDriver(
  id: string,
  data: Partial<Omit<Driver, "id" | "createdAt" | "updatedAt">>,
): Promise<void> {
  await updateDoc(doc(ref, id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteDriver(id: string): Promise<void> {
  await deleteDoc(doc(ref, id));
}
