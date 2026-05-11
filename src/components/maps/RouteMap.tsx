import {
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import {
  Map,
  AdvancedMarker,
  useMap,
  useMapsLibrary,
} from "@vis.gl/react-google-maps";
import { Locate, Undo2 } from "lucide-react";
import { useTheme } from "../../hooks/useTheme";
import { useSystemColorScheme } from "@/hooks/useSystemColorScheme";
import { directionsCache } from "@/lib/directions-cache";

// Geographic center of Manaus
const MANAUS_CENTER = { lat: -3.119, lng: -60.021 };

export interface MapStop {
  lat: number;
  lng: number;
  label: string;
}

export interface DirectionsError {
  status: string;
  stopsGeoKey: string;
}

interface DirectionsLayerProps {
  stops: MapStop[];
  onDistanceChange?: (km: number) => void;
  onError?: (err: DirectionsError) => void;
}

function fitMapToStops(map: google.maps.Map, stops: MapStop[]) {
  if (stops.length === 0) return;
  if (stops.length === 1) {
    map.setCenter({ lat: stops[0].lat, lng: stops[0].lng });
    map.setZoom(14);
    return;
  }

  const bounds = new google.maps.LatLngBounds();
  stops.forEach((s) => bounds.extend({ lat: s.lat, lng: s.lng }));
  map.fitBounds(bounds, 80);
}

/** Renders the route polyline using Directions API. Must be a child of <Map>. */
function DirectionsLayer({ stops, onDistanceChange, onError }: DirectionsLayerProps) {
  const map = useMap();
  const routesLib = useMapsLibrary("routes");
  const rendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
  const lastStopsGeoKeyRef = useRef("");

  // Keep callbacks in refs so the stops-driven effect doesn't need them as
  // dependencies (avoids re-firing the debounce when the parent re-renders
  // with a new inline function).
  const onDistanceChangeRef = useRef(onDistanceChange);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onDistanceChangeRef.current = onDistanceChange;
    onErrorRef.current = onError;
  });

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

  // Re-compute route whenever stops change (debounced to save API calls).
  useEffect(() => {
    if (!routesLib || !rendererRef.current) return;

    const stopsGeoKey = stops.map((s) => `${s.lat},${s.lng}`).join("|");
    if (stopsGeoKey === lastStopsGeoKeyRef.current) return;
    lastStopsGeoKeyRef.current = stopsGeoKey;

    // Cache hit: serve result immediately without a network call.
    const cached = directionsCache.get(stopsGeoKey);
    if (cached != null) {
      rendererRef.current.setDirections(cached.result);
      onDistanceChangeRef.current?.(Math.round(cached.totalMeters / 100) / 10);
      return;
    }

    if (stops.length < 2) {
      rendererRef.current.setDirections({ routes: [] } as never);
      return;
    }

    // `cancelled` guards against the effect tearing down (stops changed again,
    // component unmounted) while the async DirectionsService call is in flight.
    // Without it, the success path would still call `setDirections` on a
    // detached renderer and `onError`/`onDistanceChange` on a stale parent.
    let cancelled = false;

    const timer = setTimeout(() => {
      if (cancelled || !rendererRef.current) return;
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
          if (cancelled || !rendererRef.current) return;
          if (status !== "OK" || !result) {
            console.error(
              `[DirectionsLayer] Directions request failed: status=${status}, key=${stopsGeoKey}`,
            );
            onErrorRef.current?.({ status, stopsGeoKey });
            // lastStopsGeoKeyRef already holds stopsGeoKey — no retry until stops change.
            return;
          }
          const totalMeters = result.routes[0].legs.reduce(
            (sum, leg) => sum + (leg.distance?.value ?? 0),
            0,
          );
          // Populate cache before rendering so subsequent hits are served immediately.
          directionsCache.set(stopsGeoKey, {
            key: stopsGeoKey,
            result,
            totalMeters,
            createdAt: Date.now(),
          });
          rendererRef.current.setDirections(result);
          onDistanceChangeRef.current?.(Math.round(totalMeters / 100) / 10);
        },
      );
    }, 800);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [stops, routesLib]);

  return null;
}

/** Fits the map bounds to the given stops. Must be a child of <Map>. */
function BoundsFitter({ stops }: { stops: MapStop[] }) {
  const map = useMap();
  const lastStopsGeoKeyRef = useRef("");

  useEffect(() => {
    if (!map || stops.length === 0) {
      lastStopsGeoKeyRef.current = "";
      return;
    }

    const stopsGeoKey = stops.map((s) => `${s.lat},${s.lng}`).join("|");
    if (stopsGeoKey === lastStopsGeoKeyRef.current) return;
    lastStopsGeoKeyRef.current = stopsGeoKey;

    fitMapToStops(map, stops);
  }, [map, stops]);

  return null;
}

/** Auto-pan to user location on mount when there are no stops. */
function AutoGeolocate({ hasStops }: { hasStops: boolean }) {
  const map = useMap();

  useEffect(() => {
    if (!map || hasStops || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        map.panTo({ lat: coords.latitude, lng: coords.longitude });
        map.setZoom(12);
      },
      () => {},
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }, [map, hasStops]);

  return null;
}

interface RouteMapProps {
  stops: MapStop[];
  onDistanceChange?: (km: number) => void;
  onError?: (err: DirectionsError) => void;
  className?: string;
}

// ─── My Location button ───────────────────────────────────────────────────────

function MyLocationButton({ stops }: { stops: MapStop[] }) {
  const map = useMap();
  const [loading, setLoading] = useState(false);
  const [showReturnToRoute, setShowReturnToRoute] = useState(false);

  const handleClick = useCallback(() => {
    if (!map) return;

    if (showReturnToRoute && stops.length > 0) {
      fitMapToStops(map, stops);
      setShowReturnToRoute(false);
      return;
    }

    if (!navigator.geolocation) return;

    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        map.panTo({ lat: coords.latitude, lng: coords.longitude });
        map.setZoom(16);
        setShowReturnToRoute(stops.length > 0);
        setLoading(false);
      },
      () => setLoading(false),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, [map, showReturnToRoute, stops]);

  const isReturnMode = showReturnToRoute && stops.length > 0;

  return (
    <button
      type="button"
      onClick={handleClick}
      title={
        isReturnMode
          ? "Voltar para visão completa da rota"
          : "Ir para minha localização"
      }
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
      {isReturnMode ? (
        <Undo2
          size={20}
          color={loading ? "#999" : "#444"}
          style={{ flexShrink: 0 }}
        />
      ) : (
        <Locate
          size={20}
          color={loading ? "#999" : "#444"}
          style={{ flexShrink: 0 }}
        />
      )}
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
  onError,
  className,
}: RouteMapProps) {
  const { theme } = useTheme();
  const mapId = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined;
  const systemTheme = useSystemColorScheme();
  const resolvedTheme = theme === "system" ? systemTheme : theme;

  return (
    <div className={className} style={{ position: "relative" }}>
      <Map
        mapId={mapId ?? null}
        colorScheme={resolvedTheme === "dark" ? "DARK" : "LIGHT"}
        defaultCenter={MANAUS_CENTER}
        defaultZoom={12}
        gestureHandling="greedy"
        disableDefaultUI={true}
        fullscreenControl={true}
        style={{ width: "100%", height: "100%" }}
      >
        <AutoGeolocate hasStops={stops.length > 0} />
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

        <DirectionsLayer stops={stops} onDistanceChange={onDistanceChange} onError={onError} />
      </Map>
      <MyLocationButton stops={stops} />
    </div>
  );
}
