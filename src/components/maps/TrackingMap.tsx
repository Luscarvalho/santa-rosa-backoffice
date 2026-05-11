import { useEffect, useMemo, useRef } from "react";
import {
  Map as GoogleMap,
  AdvancedMarker,
  useMap,
  useMapsLibrary,
} from "@vis.gl/react-google-maps";
import { useTheme } from "../../hooks/useTheme";
import { useSystemColorScheme } from "@/hooks/useSystemColorScheme";
import { simplifyPath } from "@/lib/simplify-path";
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

// ─── Follow selected driver ───────────────────────────────────────────────────

function FollowDriver({ location }: { location: DriverLocation | undefined }) {
  const map = useMap();
  // Extract primitives so the effect deps are statically analyzable and don't
  // need `location?.lat` inline (which the exhaustive-deps lint can't validate).
  const lat = location?.lat;
  const lng = location?.lng;
  const hasLocation = location != null;

  useEffect(() => {
    if (!map || lat === undefined || lng === undefined) return;
    map.panTo({ lat, lng });
  }, [map, lat, lng]);

  // Zoom in once when following starts.
  const wasFollowing = useRef(false);
  useEffect(() => {
    if (!map) return;
    if (hasLocation && !wasFollowing.current) {
      map.setZoom(15);
      wasFollowing.current = true;
    }
    if (!hasLocation && wasFollowing.current) {
      wasFollowing.current = false;
    }
  }, [map, hasLocation]);

  return null;
}

// ─── Trail polyline ───────────────────────────────────────────────────────────

function TrailPolyline({
  trail,
  color,
}: {
  trail: Array<{ lat: number; lng: number }>;
  color: string;
}) {
  const map = useMap();
  const mapsLib = useMapsLibrary("maps");
  const polylineRef = useRef<google.maps.Polyline | null>(null);

  useEffect(() => {
    if (!mapsLib || !map) return;
    const polyline = new google.maps.Polyline({
      strokeColor: color,
      strokeWeight: 4,
      strokeOpacity: 0.7,
      map,
    });
    polylineRef.current = polyline;
    return () => {
      polyline.setMap(null);
      polylineRef.current = null;
    };
  }, [mapsLib, map, color]);

  useEffect(() => {
    if (!polylineRef.current) return;
    polylineRef.current.setPath(
      simplifyPath(trail, { toleranceMeters: 15 }).map((p) => ({ lat: p.lat, lng: p.lng })),
    );
  }, [trail]);

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
  selectedDriverId: string | null;
  trail: Array<{ lat: number; lng: number }>;
  className?: string;
}

export function TrackingMap({
  locations,
  driverNames,
  selectedDriverId,
  trail,
  className,
}: TrackingMapProps) {
  const { theme } = useTheme();
  const mapId = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined;
  const systemTheme = useSystemColorScheme();
  const resolvedTheme = theme === "system" ? systemTheme : theme;

  // Stable color assignment by sorted driver IDs — memoized to preserve
  // referential identity across renders where the set of IDs is unchanged.
  //
  // `sortedIds` is the canonical source of truth; `sortedIdsKey` is a
  // primitive string derived from it so `useMemo`'s dependency check can
  // detect "same set, same order" cheaply. The key is also used for
  // memoizing the color Map below without round-tripping through
  // `split("|")` — driver IDs can legally contain `|` even if our current
  // generator (UUIDs) doesn't.
  const sortedIds = useMemo(
    () => [...new Set(locations.map((l) => l.driverId))].sort(),
    [locations],
  );
  const sortedIdsKey = sortedIds.join("|");

  const driverColorMap = useMemo(() => {
    const map = new Map<string, string>();
    sortedIds.forEach((id, idx) => map.set(id, getDriverColor(idx)));
    return map;
    // Intentionally keyed on the primitive `sortedIdsKey` rather than
    // `sortedIds`: two arrays with identical contents hash to the same
    // string, so the memo survives even if `sortedIds` briefly gets a new
    // reference before the outer memo stabilizes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedIdsKey]);

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
        style={{ width: "100%", height: "100%" }}
      >
        <FollowDriver
          location={
            selectedDriverId
              ? locations.find((l) => l.driverId === selectedDriverId)
              : undefined
          }
        />

        {selectedDriverId && trail.length > 1 && (
          <TrailPolyline
            trail={trail}
            color={driverColorMap.get(selectedDriverId) ?? "#3b82f6"}
          />
        )}

        {locations.map((loc) => {
          const isSelected = loc.driverId === selectedDriverId;
          const name = driverNames[loc.driverId] ?? "Motorista";
          const color = driverColorMap.get(loc.driverId) ?? "#3b82f6";
          const speed = loc.speed > 0 ? ` • ${Math.round(loc.speed)} km/h` : "";
          const ago = formatTimeAgo(loc.updatedAt?.toDate());

          return (
            <AdvancedMarker
              key={loc.driverId}
              position={{ lat: loc.lat, lng: loc.lng }}
              title={`${name}${speed} — ${ago}`}
              zIndex={isSelected ? 999 : 1}
            >
              <div
                style={{
                  transform: `scale(${isSelected ? 1.3 : 1})`,
                  transition: "transform 0.2s ease",
                }}
              >
                <TruckMarker heading={loc.heading} color={color} />
              </div>
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
