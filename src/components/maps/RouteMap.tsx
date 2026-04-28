import { useEffect, useRef, useState, useCallback } from "react";
import {
  Map,
  AdvancedMarker,
  useMap,
  useMapsLibrary,
} from "@vis.gl/react-google-maps";
import { Locate } from "lucide-react";

// Geographic center of Brazil
const BRAZIL_CENTER = { lat: -14.235, lng: -51.925 };

export interface MapStop {
  lat: number;
  lng: number;
  label: string;
}

interface DirectionsLayerProps {
  stops: MapStop[];
  onDistanceChange?: (km: number) => void;
}

/** Renders the route polyline using Directions API. Must be a child of <Map>. */
function DirectionsLayer({ stops, onDistanceChange }: DirectionsLayerProps) {
  const map = useMap();
  const routesLib = useMapsLibrary("routes");
  const rendererRef = useRef<google.maps.DirectionsRenderer | null>(null);

  // Create and attach renderer once
  useEffect(() => {
    if (!routesLib || !map) return;
    const renderer = new routesLib.DirectionsRenderer({
      suppressMarkers: true,
      polylineOptions: {
        strokeColor: "#3b82f6",
        strokeWeight: 5,
        strokeOpacity: 0.8,
      },
    });
    renderer.setMap(map);
    rendererRef.current = renderer;
    return () => {
      renderer.setMap(null);
      rendererRef.current = null;
    };
  }, [routesLib, map]);

  // Re-compute route whenever stops change
  useEffect(() => {
    if (!routesLib || !rendererRef.current) return;

    if (stops.length < 2) {
      rendererRef.current.setDirections({ routes: [] } as never);
      return;
    }

    const service = new routesLib.DirectionsService();
    const origin = stops[0];
    const destination = stops[stops.length - 1];
    const waypoints = stops.slice(1, -1).map((s) => ({
      location: new google.maps.LatLng(s.lat, s.lng),
      stopover: true,
    }));

    service.route(
      {
        origin: new google.maps.LatLng(origin.lat, origin.lng),
        destination: new google.maps.LatLng(destination.lat, destination.lng),
        waypoints,
        optimizeWaypoints: false,
        travelMode: routesLib.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status !== "OK" || !result || !rendererRef.current) return;
        rendererRef.current.setDirections(result);
        if (onDistanceChange) {
          const totalMeters = result.routes[0].legs.reduce(
            (sum, leg) => sum + (leg.distance?.value ?? 0),
            0,
          );
          onDistanceChange(Math.round(totalMeters / 100) / 10);
        }
      },
    );
  }, [stops, routesLib, onDistanceChange]);

  return null;
}

/** Fits the map bounds to the given stops. Must be a child of <Map>. */
function BoundsFitter({ stops }: { stops: MapStop[] }) {
  const map = useMap();

  useEffect(() => {
    if (!map || stops.length === 0) return;
    if (stops.length === 1) {
      map.setCenter({ lat: stops[0].lat, lng: stops[0].lng });
      map.setZoom(14);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    stops.forEach((s) => bounds.extend({ lat: s.lat, lng: s.lng }));
    map.fitBounds(bounds, 80);
  }, [map, stops]);

  return null;
}

interface RouteMapProps {
  stops: MapStop[];
  onDistanceChange?: (km: number) => void;
  className?: string;
}

// ─── My Location button ───────────────────────────────────────────────────────

function MyLocationButton() {
  const map = useMap();
  const [loading, setLoading] = useState(false);

  const handleClick = useCallback(() => {
    if (!map || !navigator.geolocation) return;
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        map.panTo({ lat: coords.latitude, lng: coords.longitude });
        map.setZoom(16);
        setLoading(false);
      },
      () => setLoading(false),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, [map]);

  return (
    <button
      type="button"
      onClick={handleClick}
      title="Ir para minha localização"
      style={{
        position: "absolute",
        bottom: 10,
        right: 10,
        width: 40,
        height: 40,
        borderRadius: 4,
        background: "#fff",
        border: "none",
        boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
        cursor: loading ? "wait" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10,
      }}
    >
      <Locate
        size={20}
        color={loading ? "#999" : "#444"}
        style={{ flexShrink: 0 }}
      />
    </button>
  );
}

/**
 * Displays a Google Map with numbered markers and a driving route.
 *
 * Requires env vars:
 *   VITE_GOOGLE_MAPS_MAP_ID — Map ID from Google Cloud Console (Map Management).
 *   Without it, AdvancedMarker custom content won't render.
 */
export function RouteMap({
  stops,
  onDistanceChange,
  className,
}: RouteMapProps) {
  const mapId = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined;

  return (
    <div className={className} style={{ position: "relative" }}>
      <Map
        mapId={mapId ?? null}
        defaultCenter={BRAZIL_CENTER}
        defaultZoom={5}
        gestureHandling="greedy"
        disableDefaultUI={true}
        fullscreenControl={true}
        style={{ width: "100%", height: "100%" }}
      >
        <BoundsFitter stops={stops} />

        {stops.map((stop, idx) => (
          <AdvancedMarker
            key={`${stop.lat}-${stop.lng}-${idx}`}
            position={{ lat: stop.lat, lng: stop.lng }}
            title={stop.label}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background:
                  idx === 0
                    ? "#22c55e"
                    : idx === stops.length - 1
                      ? "#ef4444"
                      : "#3b82f6",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: 14,
                border: "2px solid #fff",
                boxShadow: "0 2px 6px rgba(0,0,0,0.35)",
              }}
            >
              {idx + 1}
            </div>
          </AdvancedMarker>
        ))}

        <DirectionsLayer stops={stops} onDistanceChange={onDistanceChange} />
      </Map>
      <MyLocationButton />
    </div>
  );
}
