import { doc, getDoc } from "firebase/firestore";
import { db } from "@lib/firebase";
import type { AppUser } from "@/types/user";

export async function fetchUserDoc(uid: string): Promise<AppUser | null> {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? (snap.data() as AppUser) : null;
}
