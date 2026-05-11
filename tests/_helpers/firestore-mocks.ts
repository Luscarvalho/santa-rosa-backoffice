/**
 * In-memory Firestore mock focused on `onSnapshot(collection(db, "locations"))`
 * behavior for the C4 (broad-scope snapshot) and C5 (hidden-tab listener)
 * property tests.
 *
 * Usage — at the top of a test file:
 *
 *   import * as firestoreMocks from "../../_helpers/firestore-mocks";
 *
 *   vi.mock("firebase/firestore", async () => {
 *     const h = await import("../../_helpers/firestore-mocks");
 *     return h.createFirestoreMockModule();
 *   });
 *   vi.mock("firebase/app",  () => ({ initializeApp: () => ({}) }));
 *   vi.mock("firebase/auth", () => ({ getAuth: () => ({}) }));
 *   vi.mock("firebase/storage", () => ({ getStorage: () => ({}) }));
 *
 * The module exposes shared mutable state (seed + subscriber set) accessible
 * to the test via helper functions below. Because the helper is a singleton
 * ES module, both the vi.mock factory and the test file share the same state.
 */

export type LocationDoc = {
  id: string;
  driverId?: string;
  routeId?: string;
  lat?: number;
  lng?: number;
  speed?: number;
  heading?: number;
  accuracy?: number;
  status?: string;
  updatedAt?: unknown;
};

interface QueryState {
  collectionName: string;
  filters: Array<{ field: string; op: string; value: unknown }>;
}

interface SubscriberState {
  query: QueryState;
  callback: (snap: {
    docs: Array<{ id: string; data: () => LocationDoc }>;
  }) => void;
  active: boolean;
}

let seed: LocationDoc[] = [];
const subscribers = new Set<SubscriberState>();

export function resetFirestoreMockState() {
  seed = [];
  subscribers.clear();
}

export function seedLocations(docs: LocationDoc[]) {
  seed = docs.slice();
  subscribers.forEach((s) => {
    if (s.active) emitTo(s);
  });
}

/** All callback deliveries ever emitted to active subscribers. */
export function getActiveSubscribers(): SubscriberState[] {
  return Array.from(subscribers).filter((s) => s.active);
}

function emitTo(s: SubscriberState) {
  const filtered = seed.filter((doc) =>
    s.query.filters.every((f) => {
      if (f.op === "==")
        return (doc as Record<string, unknown>)[f.field] === f.value;
      return true;
    }),
  );
  s.callback({
    docs: filtered.map((doc) => ({ id: doc.id, data: () => ({ ...doc }) })),
  });
}

/**
 * Creates the module-shape object that the `firebase/firestore` mock should
 * return. Called from a test file's `vi.mock(..., () => createFirestoreMockModule())`.
 */
export function createFirestoreMockModule() {
  function collection(_db: unknown, name: string): QueryState {
    return { collectionName: name, filters: [] };
  }
  function query(
    q: QueryState,
    ...constraints: QueryState["filters"]
  ): QueryState {
    return { ...q, filters: [...q.filters, ...constraints] };
  }
  function where(field: string, op: string, value: unknown) {
    return { field, op, value } as unknown as QueryState["filters"][number];
  }
  function onSnapshot(
    q: QueryState,
    cb: SubscriberState["callback"],
  ): () => void {
    const sub: SubscriberState = { query: q, callback: cb, active: true };
    subscribers.add(sub);
    emitTo(sub);
    return () => {
      sub.active = false;
      subscribers.delete(sub);
    };
  }
  return {
    collection,
    query,
    where,
    onSnapshot,
    Timestamp: class {
      static now() {
        return { toDate: () => new Date() };
      }
    },
    getFirestore: () => ({}),
    doc: () => ({}),
    getDoc: () => ({ exists: () => false }),
    getDocs: async () => ({ docs: [] }),
    setDoc: async () => {},
    updateDoc: async () => {},
    deleteDoc: async () => {},
    addDoc: async () => ({ id: "x" }),
    serverTimestamp: () => null,
    orderBy: (..._a: unknown[]) => ({}),
    limit: (..._a: unknown[]) => ({}),
    writeBatch: () => ({
      set: () => {},
      update: () => {},
      delete: () => {},
      commit: async () => {},
    }),
  };
}
