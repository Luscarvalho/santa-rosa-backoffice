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
import type { Vehicle } from "@/types/vehicle";

const ref = collection(db, "vehicles");

export async function getVehicles(): Promise<Vehicle[]> {
  const snap = await getDocs(ref);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Vehicle);
}

export async function getVehicle(id: string): Promise<Vehicle | null> {
  const snap = await getDoc(doc(ref, id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Vehicle) : null;
}

export async function createVehicle(
  data: Omit<Vehicle, "id" | "createdAt" | "updatedAt">,
): Promise<void> {
  await addDoc(ref, {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: null,
  });
}

export async function updateVehicle(
  id: string,
  data: Partial<Omit<Vehicle, "id" | "createdAt" | "updatedAt">>,
): Promise<void> {
  await updateDoc(doc(ref, id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteVehicle(id: string): Promise<void> {
  await deleteDoc(doc(ref, id));
}
