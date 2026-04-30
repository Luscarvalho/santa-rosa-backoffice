/**
 * Seed + simula 3 motoristas se movendo em Manaus simultaneamente.
 *
 * Uso:
 *   node --env-file=.env scripts/seed-and-simulate.mjs
 */

import { initializeApp } from "firebase/app";
import {
  getFirestore,
  doc,
  setDoc,
  addDoc,
  updateDoc,
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

// ─── Dados dos 3 motoristas ──────────────────────────────────────────────────

const driversData = [
  {
    name: "Carlos Silva",
    email: "carlos@santarosa.com",
    phone: "92999001234",
    license: "00123456789",
    vehicle: {
      plate: "PHN-4A32",
      model: "VW Delivery 11.180",
      year: 2023,
      capacity: 6500,
    },
    route: "Rota Centro-Norte",
    waypoints: [
      { lat: -3.1019, lng: -60.025 },
      { lat: -3.0985, lng: -60.0235 },
      { lat: -3.0945, lng: -60.022 },
      { lat: -3.0905, lng: -60.0205 },
      { lat: -3.0865, lng: -60.019 },
      { lat: -3.0825, lng: -60.0175 },
      { lat: -3.0785, lng: -60.02 },
      { lat: -3.0745, lng: -60.023 },
      { lat: -3.0705, lng: -60.026 },
      { lat: -3.0665, lng: -60.028 },
      { lat: -3.0625, lng: -60.031 },
      { lat: -3.0585, lng: -60.034 },
    ],
  },
  {
    name: "Ana Oliveira",
    email: "ana@santarosa.com",
    phone: "92988112233",
    license: "11234567890",
    vehicle: {
      plate: "QRS-5B67",
      model: "Mercedes Accelo 1016",
      year: 2024,
      capacity: 5000,
    },
    route: "Rota Zona Sul",
    waypoints: [
      { lat: -3.119, lng: -60.021 },
      { lat: -3.124, lng: -60.024 },
      { lat: -3.129, lng: -60.028 },
      { lat: -3.134, lng: -60.031 },
      { lat: -3.138, lng: -60.035 },
      { lat: -3.143, lng: -60.038 },
      { lat: -3.148, lng: -60.042 },
      { lat: -3.152, lng: -60.045 },
      { lat: -3.155, lng: -60.049 },
      { lat: -3.158, lng: -60.053 },
      { lat: -3.161, lng: -60.057 },
      { lat: -3.164, lng: -60.061 },
    ],
  },
  {
    name: "Roberto Santos",
    email: "roberto@santarosa.com",
    phone: "92977443322",
    license: "22345678901",
    vehicle: {
      plate: "MNO-8C91",
      model: "Iveco Daily 35S14",
      year: 2022,
      capacity: 3500,
    },
    route: "Rota Zona Leste",
    waypoints: [
      { lat: -3.1, lng: -60.01 },
      { lat: -3.098, lng: -60.005 },
      { lat: -3.095, lng: -60.0 },
      { lat: -3.092, lng: -59.995 },
      { lat: -3.089, lng: -59.99 },
      { lat: -3.086, lng: -59.985 },
      { lat: -3.083, lng: -59.981 },
      { lat: -3.08, lng: -59.977 },
      { lat: -3.077, lng: -59.973 },
      { lat: -3.074, lng: -59.969 },
      { lat: -3.071, lng: -59.965 },
      { lat: -3.068, lng: -59.961 },
    ],
  },
];

// ─── Seed ─────────────────────────────────────────────────────────────────────

console.log("🌱 Criando dados no Firestore...\n");

const simulations = [];

for (const d of driversData) {
  const driverRef = await addDoc(collection(db, "drivers"), {
    name: d.name,
    email: d.email,
    phone: d.phone,
    licenseNumber: d.license,
    licenseExpiry: Timestamp.fromDate(new Date("2027-12-31")),
    vehicleId: null,
    status: "on_route",
    createdAt: Timestamp.now(),
    updatedAt: null,
  });

  const vehicleRef = await addDoc(collection(db, "vehicles"), {
    ...d.vehicle,
    status: "in_use",
    currentDriverId: driverRef.id,
    createdAt: Timestamp.now(),
    updatedAt: null,
  });

  await setDoc(
    doc(db, "drivers", driverRef.id),
    { vehicleId: vehicleRef.id },
    { merge: true },
  );

  const routeRef = await addDoc(collection(db, "routes"), {
    name: `${d.route} — 28/04`,
    driverId: driverRef.id,
    vehicleId: vehicleRef.id,
    status: "active",
    startedAt: Timestamp.now(),
    completedAt: null,
    totalDeliveries: 5,
    completedDeliveries: 0,
    estimatedDistance: 15,
    notes: "",
    createdAt: Timestamp.now(),
    createdBy: "seed-script",
    updatedAt: null,
  });

  await setDoc(doc(db, "locations", driverRef.id), {
    driverId: driverRef.id,
    routeId: routeRef.id,
    lat: d.waypoints[0].lat,
    lng: d.waypoints[0].lng,
    speed: 0,
    heading: 0,
    accuracy: 5,
    updatedAt: Timestamp.now(),
  });

  console.log(`  ✓ ${d.name} (${driverRef.id})`);

  simulations.push({
    name: d.name,
    driverId: driverRef.id,
    locationRef: doc(db, "locations", driverRef.id),
    waypoints: d.waypoints,
    idx: 0,
  });
}

console.log("\n🎉 Seed completo! Iniciando simulação...\n");

// ─── Simulação ────────────────────────────────────────────────────────────────

function calculateHeading(from, to) {
  const dLng = to.lng - from.lng;
  const dLat = to.lat - from.lat;
  return ((Math.atan2(dLng, dLat) * 180) / Math.PI + 360) % 360;
}

async function tick(sim) {
  const wp = sim.waypoints;
  const current = wp[sim.idx % wp.length];
  const next = wp[(sim.idx + 1) % wp.length];
  const heading = calculateHeading(current, next);
  const speed = 25 + Math.random() * 30;

  await updateDoc(sim.locationRef, {
    lat: current.lat + (Math.random() - 0.5) * 0.0005,
    lng: current.lng + (Math.random() - 0.5) * 0.0005,
    speed: Math.round(speed * 10) / 10,
    heading: Math.round(heading),
    accuracy: Math.round(3 + Math.random() * 7),
    updatedAt: Timestamp.now(),
  });

  sim.idx++;
  if (sim.idx >= wp.length) sim.idx = 0;

  const pos = `(${current.lat.toFixed(4)}, ${current.lng.toFixed(4)})`;
  console.log(`  🚛 ${sim.name.padEnd(16)} ${pos}  ${Math.round(speed)} km/h`);
}

async function tickAll() {
  await Promise.all(simulations.map(tick));
  console.log("");
}

console.log("🚛 3 motoristas em movimento — Ctrl+C para parar\n");

tickAll();
setInterval(tickAll, 3000);
