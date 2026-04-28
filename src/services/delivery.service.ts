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
import type { Delivery } from "@/types/delivery";

function deliveriesRef(routeId: string) {
  return collection(db, "routes", routeId, "deliveries");
}

export async function getDeliveries(routeId: string): Promise<Delivery[]> {
  const snap = await getDocs(
    query(deliveriesRef(routeId), orderBy("order", "asc")),
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Delivery);
}

export async function getDelivery(
  routeId: string,
  deliveryId: string,
): Promise<Delivery | null> {
  const snap = await getDoc(doc(deliveriesRef(routeId), deliveryId));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Delivery) : null;
}

export async function createDelivery(
  routeId: string,
  data: Omit<
    Delivery,
    | "id"
    | "createdAt"
    | "updatedAt"
    | "deliveredAt"
    | "deliveryPhoto"
    | "recipientSignature"
    | "failureReason"
    | "attempts"
  >,
): Promise<void> {
  await addDoc(deliveriesRef(routeId), {
    ...data,
    deliveredAt: null,
    deliveryPhoto: null,
    recipientSignature: null,
    failureReason: null,
    attempts: 0,
    createdAt: serverTimestamp(),
    updatedAt: null,
  });
}

export async function updateDelivery(
  routeId: string,
  deliveryId: string,
  data: Partial<Omit<Delivery, "id" | "createdAt" | "updatedAt">>,
): Promise<void> {
  await updateDoc(doc(deliveriesRef(routeId), deliveryId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteDelivery(
  routeId: string,
  deliveryId: string,
): Promise<void> {
  await deleteDoc(doc(deliveriesRef(routeId), deliveryId));
}
