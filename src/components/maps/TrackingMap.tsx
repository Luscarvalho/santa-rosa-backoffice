import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  Map as GoogleMap,
  AdvancedMarker,
  useMap,
} from "@vis.gl/react-google-maps";
import { useTheme } from "../../hooks/useTheme";
import type { DriverLocation } from "@/types/location";

const MANAUS_CENTER = { lat: -3.119, lng: -60.021 };

// ─── Truck SVG marker ─────────────────────────────────────────────────────────

function TruckMarker({ heading, color }: { heading: number; color: string }) {
  return (
    <div
      style={{
        transform: `rotate(${heading}deg)`,
        width: 40,
        height: 40,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.4))",
      }}
    >
      <svg
        width="32"
        height="32"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Truck body */}
        <rect x="3" y="4" width="12" height="12" rx="2" fill={color} />
        {/* Cab */}
        <path
          d="M15 8h2.5a2 2 0 012 2v4a2 2 0 01-2 2H15V8z"
          fill={color}
          opacity="0.8"
        />
        {/* Windshield */}
        <rect
          x="15.5"
          y="9"
          width="3"
          height="3"
          rx="0.5"
          fill="#fff"
          opacity="0.7"
        />
        {/* Wheels */}
        <circle cx="7" cy="17.5" r="1.5" fill="#333" />
        <circle cx="17" cy="17.5" r="1.5" fill="#333" />
        {/* Bed lines */}
        <line
          x1="5"
          y1="8"
          x2="13"
          y2="8"
          stroke="#fff"
          strokeWidth="0.5"
          opacity="0.3"
        />
        <line
          x1="5"
          y1="11"
          x2="13"
          y2="11"
          stroke="#fff"
          strokeWidth="0.5"
          opacity="0.3"
        />
      </svg>
    </div>
  );
}

// ─── Bounds fitter ────────────────────────────────────────────────────────────

function BoundsFitter({ locations }: { locations: DriverLocation[] }) {
  const map = useMap();
  const lastKeyRef = useRef("");

  useEffect(() => {
    if (!map || locations.length === 0) {
      lastKeyRef.current = "";
      return;
    }

    const key = locations
      .map((l) => `${l.driverId}:${l.lat.toFixed(4)},${l.lng.toFixed(4)}`)
      .join("|");
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;

    if (locations.length === 1) {
      map.panTo({ lat: locations[0].lat, lng: locations[0].lng });
      map.setZoom(14);
      return;
    }

    const bounds = new google.maps.LatLngBounds();
    locations.forEach((l) => bounds.extend({ lat: l.lat, lng: l.lng }));
    map.fitBounds(bounds, 60);
  }, [map, locations]);

  return null;
}

// ─── Color palette for drivers ────────────────────────────────────────────────

const DRIVER_COLORS = [
  "#3b82f6", // blue
  "#ef4444", // red
  "#22c55e", // green
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
  "#14b8a6", // teal
  "#6366f1", // indigo
];

function getDriverColor(index: number): string {
  return DRIVER_COLORS[index % DRIVER_COLORS.length];
}

// ─── Main component ───────────────────────────────────────────────────────────

interface TrackingMapProps {
  locations: DriverLocation[];
  driverNames: Record<string, string>;
  className?: string;
}

export function TrackingMap({
  locations,
  driverNames,
  className,
}: TrackingMapProps) {
  const { theme } = useTheme();
  const mapId = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined;
  const systemTheme = useSyncExternalStore(
    (onStoreChange) => {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", onStoreChange);
      return () => mq.removeEventListener("change", onStoreChange);
    },
    () =>
      window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light",
    () => "light",
  );
  const resolvedTheme = theme === "system" ? systemTheme : theme;
  const mapFilter =
    resolvedTheme === "dark"
      ? "saturate(0.72) brightness(0.92) contrast(0.95)"
      : "none";

  // Stable color assignment by sorted driver IDs
  const driverColorMap = new Map<string, string>();
  const sortedIds = [...new Set(locations.map((l) => l.driverId))].sort();
  sortedIds.forEach((id, idx) => driverColorMap.set(id, getDriverColor(idx)));

  return (
    <div className={className} style={{ position: "relative" }}>
      <GoogleMap
        mapId={mapId ?? null}
        colorScheme={resolvedTheme === "dark" ? "DARK" : "LIGHT"}
        defaultCenter={MANAUS_CENTER}
        defaultZoom={12}
        gestureHandling="greedy"
        disableDefaultUI={true}
        fullscreenControl={true}
        zoomControl={true}
        style={{ width: "100%", height: "100%", filter: mapFilter }}
      >
        <BoundsFitter locations={locations} />

        {locations.map((loc) => {
          const name = driverNames[loc.driverId] ?? "Motorista";
          const color = driverColorMap.get(loc.driverId) ?? "#3b82f6";
          const speed = loc.speed > 0 ? ` • ${Math.round(loc.speed)} km/h` : "";
          const ago = formatTimeAgo(loc.updatedAt?.toDate());

          return (
            <AdvancedMarker
              key={loc.driverId}
              position={{ lat: loc.lat, lng: loc.lng }}
              title={`${name}${speed} — ${ago}`}
            >
              <TruckMarker heading={loc.heading} color={color} />
            </AdvancedMarker>
          );
        })}
      </GoogleMap>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimeAgo(date: Date | undefined): string {
  if (!date) return "sem dados";
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "agora";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}min atrás`;
  const diffHours = Math.floor(diffMin / 60);
  return `${diffHours}h atrás`;
}
