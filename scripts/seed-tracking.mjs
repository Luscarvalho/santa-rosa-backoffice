/**
 * Seed script: cria um motorista, um veículo, uma rota ativa
 * e um documento de localização em tempo real.
 *
 * Uso:
 *   node --env-file=.env scripts/seed-tracking.mjs
 */

import { initializeApp } from "firebase/app";
import {
  getFirestore,
  doc,
  setDoc,
  addDoc,
  collection,
  Timestamp,
} from "firebase/firestore";

const app = initializeApp({
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
});

const db = getFirestore(app);

// ─── 1. Criar motorista ──────────────────────────────────────────────────────

const driverRef = await addDoc(collection(db, "drivers"), {
  name: "Carlos Silva",
  email: "carlos@santarosa.com",
  phone: "92999001234",
  licenseNumber: "00123456789",
  licenseExpiry: Timestamp.fromDate(new Date("2027-12-31")),
  vehicleId: null, // será preenchido abaixo
  status: "on_route",
  createdAt: Timestamp.now(),
  updatedAt: null,
});

console.log(`✓ Motorista criado: ${driverRef.id}`);

// ─── 2. Criar veículo ────────────────────────────────────────────────────────

const vehicleRef = await addDoc(collection(db, "vehicles"), {
  plate: "PHN-4A32",
  model: "VW Delivery 11.180",
  year: 2023,
  capacity: 6500,
  status: "in_use",
  currentDriverId: driverRef.id,
  createdAt: Timestamp.now(),
  updatedAt: null,
});

console.log(`✓ Veículo criado: ${vehicleRef.id}`);

// Atualizar o motorista com o veículo
await setDoc(
  doc(db, "drivers", driverRef.id),
  { vehicleId: vehicleRef.id },
  { merge: true },
);

// ─── 3. Criar rota ativa ─────────────────────────────────────────────────────

const routeRef = await addDoc(collection(db, "routes"), {
  name: "Rota Centro-Norte — 28/04",
  driverId: driverRef.id,
  vehicleId: vehicleRef.id,
  status: "active",
  startedAt: Timestamp.now(),
  completedAt: null,
  totalDeliveries: 5,
  completedDeliveries: 2,
  estimatedDistance: 18.5,
  notes: "Rota de teste para rastreamento",
  createdAt: Timestamp.now(),
  createdBy: "seed-script",
  updatedAt: null,
});

console.log(`✓ Rota criada: ${routeRef.id}`);

// ─── 4. Criar localização do motorista ───────────────────────────────────────
//    Documento ID = driverId (sobrescrito a cada update do app mobile)

await setDoc(doc(db, "locations", driverRef.id), {
  driverId: driverRef.id,
  routeId: routeRef.id,
  lat: -3.1019,
  lng: -60.025,
  speed: 42.5,
  heading: 180,
  accuracy: 5,
  updatedAt: Timestamp.now(),
});

console.log(`✓ Localização criada para motorista ${driverRef.id}`);

console.log("\n🎉 Seed completo! Abra /tracking para ver o caminhão no mapa.");
console.log(
  "\nPara simular movimento, rode:\n  node --env-file=.env scripts/simulate-movement.mjs " +
    driverRef.id,
);

process.exit(0);
