import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  serverTimestamp,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "@lib/firebase";
import type { Route } from "@/types/route";

const ref = collection(db, "routes");

export async function getRoutes(): Promise<Route[]> {
  const snap = await getDocs(query(ref, orderBy("createdAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Route);
}

export async function getRoute(id: string): Promise<Route | null> {
  const snap = await getDoc(doc(ref, id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Route) : null;
}

export async function createRoute(
  data: Omit<
    Route,
    | "id"
    | "createdAt"
    | "updatedAt"
    | "startedAt"
    | "completedAt"
    | "completedDeliveries"
    | "totalDeliveries"
    | "estimatedDistance"
  >,
): Promise<string> {
  const docRef = await addDoc(ref, {
    ...data,
    totalDeliveries: 0,
    estimatedDistance: 0,
    completedDeliveries: 0,
    startedAt: null,
    completedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: null,
  });
  return docRef.id;
}

export async function updateRoute(
  id: string,
  data: Partial<Omit<Route, "id" | "createdAt" | "updatedAt">>,
): Promise<void> {
  await updateDoc(doc(ref, id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteRoute(id: string): Promise<void> {
  await deleteDoc(doc(ref, id));
}
