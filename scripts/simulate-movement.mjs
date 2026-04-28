/**
 * Simula um motorista se movendo em Manaus.
 * Atualiza a localização no Firestore a cada 3 segundos.
 *
 * Uso:
 *   node --env-file=.env scripts/simulate-movement.mjs <driverId>
 */

import { initializeApp } from "firebase/app";
import { getFirestore, doc, updateDoc, Timestamp } from "firebase/firestore";

const driverId = process.argv[2];
if (!driverId) {
  console.error(
    "Uso: node --env-file=.env scripts/simulate-movement.mjs <driverId>",
  );
  process.exit(1);
}

const app = initializeApp({
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
});

const db = getFirestore(app);
const locationRef = doc(db, "locations", driverId);

// Waypoints em Manaus (rota fictícia Centro → Zona Norte)
const waypoints = [
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
  { lat: -3.0545, lng: -60.036 },
  { lat: -3.051, lng: -60.038 },
];

let idx = 0;

function calculateHeading(from, to) {
  const dLng = to.lng - from.lng;
  const dLat = to.lat - from.lat;
  const angle = (Math.atan2(dLng, dLat) * 180) / Math.PI;
  return (angle + 360) % 360;
}

async function tick() {
  const current = waypoints[idx % waypoints.length];
  const next = waypoints[(idx + 1) % waypoints.length];
  const heading = calculateHeading(current, next);
  const speed = 30 + Math.random() * 25; // 30-55 km/h

  await updateDoc(locationRef, {
    lat: current.lat + (Math.random() - 0.5) * 0.0005, // jitter
    lng: current.lng + (Math.random() - 0.5) * 0.0005,
    speed: Math.round(speed * 10) / 10,
    heading: Math.round(heading),
    accuracy: Math.round(3 + Math.random() * 7),
    updatedAt: Timestamp.now(),
  });

  idx++;
  const pos = `(${current.lat.toFixed(4)}, ${current.lng.toFixed(4)})`;
  console.log(
    `📍 [${idx}] ${pos} — ${Math.round(speed)} km/h — heading ${Math.round(heading)}°`,
  );

  if (idx >= waypoints.length) {
    console.log("\n✅ Rota completa! Reiniciando...");
    idx = 0;
  }
}

console.log(`🚛 Simulando motorista ${driverId} — Ctrl+C para parar\n`);

// Tick imediato + a cada 3 segundos
tick();
setInterval(tick, 3000);
