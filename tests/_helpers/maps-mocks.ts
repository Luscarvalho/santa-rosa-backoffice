/**
 * Shared mocks / factories for Google Maps JS API in jsdom.
 *
 * The code under test imports `@vis.gl/react-google-maps` and, inside effects,
 * reaches for the global `google.maps.*` SDK. jsdom has neither. These helpers
 * install minimal shims that are observable (mountCount, route-call counts,
 * session-token capture) so the exploratory PBTs can assert on the current
 * behavior of `F`.
 *
 * All mocks are stateful per-test — call `resetMapsMocks()` in `beforeEach`.
 */

import * as React from "react";
import type { ReactNode } from "react";
import { directionsCache } from "../../src/lib/directions-cache";

// ─── Global state captured by the mocks ───────────────────────────────────────

export interface MapsMockState {
  /** How many times <APIProvider> has been mounted (incremented on mount effect). */
  apiProviderMountCount: number;
  /** Libraries prop last seen on <APIProvider>. */
  apiProviderLibrariesHistory: Array<ReadonlyArray<string> | undefined>;
  /** Autocomplete constructions: one entry per `new placesLib.Autocomplete(...)`. */
  autocompleteConstructions: Array<{
    sessionToken: unknown;
    options: Record<string, unknown>;
    /** Direct reference to the constructed instance, usable by tests to fire place_changed. */
    instance: AutocompleteInstanceHandle;
  }>;
  /**
   * AutocompleteService.getPlacePredictions calls — captured by the new
   * adapter-based PlaceAutocomplete (fixes C2). Each entry records the
   * sessionToken passed in the request.
   */
  autocompleteServiceCalls: Array<{
    input: string;
    sessionToken: unknown;
    request: unknown;
  }>;
  /**
   * PlacesService.getDetails calls — captured when adapter.select() is called.
   * Each entry records the sessionToken passed in the request.
   */
  placesServiceDetailsCalls: Array<{
    placeId: string;
    sessionToken: unknown;
    request: unknown;
  }>;
  /** DirectionsService.route() calls — payload is the first arg. */
  directionsRouteCalls: Array<{
    stopsGeoKey: string;
    request: unknown;
  }>;
  /** Polyline instances created; we track filter/style/setPath observations here. */
  polylineInstances: Array<{
    options: Record<string, unknown>;
    paths: Array<Array<{ lat: number; lng: number }>>;
  }>;
  /** Chronological map method calls (panTo / setZoom / setCenter / fitBounds). */
  mapCalls: Array<{
    method: "panTo" | "setZoom" | "setCenter" | "fitBounds";
    args: ReadonlyArray<unknown>;
  }>;
  /** Last known place_changed payload, configurable by tests via `setNextPlace`. */
  nextPlace: {
    formatted_address: string;
    lat: number;
    lng: number;
  } | null;
  /** Predictions to return from AutocompleteService.getPlacePredictions. */
  nextPredictions: Array<{ place_id: string; description: string }> | null;
}

/** Public surface for FakeAutocomplete instances used by tests. */
export interface AutocompleteInstanceHandle {
  fire(event: "place_changed"): void;
  getPlace(): {
    formatted_address: string;
    geometry: { location: { lat: () => number; lng: () => number } };
  };
}

const freshState = (): MapsMockState => ({
  apiProviderMountCount: 0,
  apiProviderLibrariesHistory: [],
  autocompleteConstructions: [],
  autocompleteServiceCalls: [],
  placesServiceDetailsCalls: [],
  directionsRouteCalls: [],
  polylineInstances: [],
  mapCalls: [],
  nextPlace: null,
  nextPredictions: null,
});

export const mapsMockState: MapsMockState = freshState();

export function resetMapsMocks() {
  Object.assign(mapsMockState, freshState());
  // Clear the directions cache singleton so property-test runs don't bleed
  // cached results into subsequent iterations.
  directionsCache.clear();
}

/**
 * Configure the payload that the next `FakeAutocomplete.getPlace()` will return.
 * Used by preservation tests to drive `onPlaceSelect` with specific values.
 */
export function setNextPlace(place: {
  formattedAddress: string;
  lat: number;
  lng: number;
} | null) {
  mapsMockState.nextPlace = place
    ? { formatted_address: place.formattedAddress, lat: place.lat, lng: place.lng }
    : null;
}

/**
 * Configure the predictions returned by `FakeAutocompleteService.getPlacePredictions`.
 * Used by tests to drive the new adapter-based PlaceAutocomplete dropdown.
 */
export function setNextPredictions(
  predictions: Array<{ place_id: string; description: string }> | null,
) {
  mapsMockState.nextPredictions = predictions;
}

// ─── Global google.maps shim ─────────────────────────────────────────────────

type LatLngLike = {
  lat: number | (() => number);
  lng: number | (() => number);
};

function latLngToLiteral(v: LatLngLike | { lat: number; lng: number }) {
  const lat = typeof v.lat === "function" ? v.lat() : v.lat;
  const lng = typeof v.lng === "function" ? v.lng() : v.lng;
  return { lat, lng };
}

export function installGoogleMapsGlobal() {
  // A full mock that only exposes what RouteMap / PlaceAutocomplete / TrackingMap
  // touch synchronously. Anything else is a noop.

  class FakeLatLng {
    constructor(
      public lat: number,
      public lng: number,
    ) {}
  }

  class FakeLatLngBounds {
    constructor(_sw?: unknown, _ne?: unknown) {}
    extend() {
      return this;
    }
  }

  // google.maps.places.Autocomplete — the piece we watch most carefully.
  class FakeAutocomplete {
    private listeners = new Map<string, Array<() => void>>();
    constructor(
      _input: HTMLInputElement,
      public options: Record<string, unknown>,
    ) {
      const handle: AutocompleteInstanceHandle = {
        fire: (event) => {
          this.listeners.get(event)?.forEach((cb) => cb());
        },
        getPlace: () => this.getPlace(),
      };
      mapsMockState.autocompleteConstructions.push({
        // The CURRENT bug is that PlaceAutocomplete never supplies a sessionToken.
        // We capture whatever `options.sessionToken` was passed (may be undefined).
        sessionToken: options?.sessionToken,
        options,
        instance: handle,
      });
    }
    addListener(event: string, cb: () => void) {
      const list = this.listeners.get(event) ?? [];
      list.push(cb);
      this.listeners.set(event, list);
      return { remove: () => {} };
    }
    getPlace() {
      const next = mapsMockState.nextPlace ?? {
        formatted_address: "Av Djalma Batista, 1661 - Manaus",
        lat: -3.1,
        lng: -60.01,
      };
      return {
        formatted_address: next.formatted_address,
        geometry: {
          location: {
            lat: () => next.lat,
            lng: () => next.lng,
          },
        },
      };
    }
    /** Test helper — fire a place_changed event. */
    __firePlaceChanged() {
      this.listeners.get("place_changed")?.forEach((cb) => cb());
    }
  }

  class FakeAutocompleteSessionToken {
    readonly __tag = "session-token";
    readonly id = Math.random().toString(36).slice(2);
  }

  class FakeAutocompleteService {
    getPlacePredictions(
      request: {
        input: string;
        sessionToken?: unknown;
        componentRestrictions?: unknown;
        bounds?: unknown;
      },
      callback: (
        predictions: Array<{ place_id: string; description: string }> | null,
        status: string,
      ) => void,
    ) {
      mapsMockState.autocompleteServiceCalls.push({
        input: request.input,
        sessionToken: request.sessionToken,
        request,
      });
      const preds = mapsMockState.nextPredictions ?? [
        {
          place_id: "place_id_1",
          description: "Av Djalma Batista, 1661 - Manaus, AM, Brasil",
        },
      ];
      queueMicrotask(() => {
        callback(preds, "OK");
      });
    }
  }

  class FakePlacesService {
    constructor(_attrContainer: HTMLDivElement) {}
    getDetails(
      request: {
        placeId: string;
        fields?: string[];
        sessionToken?: unknown;
      },
      callback: (
        place: {
          formatted_address: string;
          geometry: { location: { lat: () => number; lng: () => number } };
        } | null,
        status: string,
      ) => void,
    ) {
      mapsMockState.placesServiceDetailsCalls.push({
        placeId: request.placeId,
        sessionToken: request.sessionToken,
        request,
      });
      const next = mapsMockState.nextPlace ?? {
        formatted_address: "Av Djalma Batista, 1661 - Manaus",
        lat: -3.1,
        lng: -60.01,
      };
      queueMicrotask(() => {
        callback(
          {
            formatted_address: next.formatted_address,
            geometry: {
              location: {
                lat: () => next.lat,
                lng: () => next.lng,
              },
            },
          },
          "OK",
        );
      });
    }
  }

  class FakeDirectionsService {
    route(
      request: {
        origin: LatLngLike;
        destination: LatLngLike;
        waypoints?: Array<{ location: LatLngLike; stopover: boolean }>;
      },
      callback: (result: unknown, status: string) => void,
    ) {
      const origin = latLngToLiteral(request.origin as LatLngLike);
      const destination = latLngToLiteral(request.destination as LatLngLike);
      const waypoints = (request.waypoints ?? []).map((w) =>
        latLngToLiteral(w.location as LatLngLike),
      );
      const pts = [origin, ...waypoints, destination];
      const stopsGeoKey = pts.map((p) => `${p.lat},${p.lng}`).join("|");
      mapsMockState.directionsRouteCalls.push({ stopsGeoKey, request });

      // Synthesize a minimal successful result.
      const legs = pts.slice(1).map(() => ({ distance: { value: 1000 } }));
      const totalLegs = legs.length;
      queueMicrotask(() => {
        callback(
          {
            routes: [
              {
                legs,
                waypoint_order: Array.from(
                  { length: Math.max(0, totalLegs - 1) },
                  (_, i) => i,
                ),
                overview_polyline: "",
              },
            ],
          },
          "OK",
        );
      });
    }
  }

  class FakeDirectionsRenderer {
    private mapInstance: unknown = null;
    constructor(public opts: Record<string, unknown> = {}) {}
    setMap(m: unknown) {
      this.mapInstance = m;
    }
    setDirections(_r: unknown) {
      // noop; cache-hit path still goes through here.
      void this.mapInstance;
    }
  }

  class FakePolyline {
    private paths: Array<Array<{ lat: number; lng: number }>> = [];
    constructor(options: Record<string, unknown> = {}) {
      mapsMockState.polylineInstances.push({ options, paths: this.paths });
    }
    setPath(path: Array<{ lat: number; lng: number }>) {
      this.paths.push(path);
    }
    setMap(_m: unknown) {}
  }

  const googleShim = {
    maps: {
      LatLng: FakeLatLng,
      LatLngBounds: FakeLatLngBounds,
      Polyline: FakePolyline,
      TravelMode: { DRIVING: "DRIVING" },
      places: {
        Autocomplete: FakeAutocomplete,
        AutocompleteSessionToken: FakeAutocompleteSessionToken,
        AutocompleteService: FakeAutocompleteService,
        PlacesService: FakePlacesService,
        PlacesServiceStatus: { OK: "OK" },
      },
      DirectionsService: FakeDirectionsService,
      DirectionsRenderer: FakeDirectionsRenderer,
      event: {
        removeListener: () => {},
        clearInstanceListeners: () => {},
      },
    },
  };

  // @ts-expect-error install global shim
  globalThis.google = googleShim;
}

// ─── Module mock factory for `@vis.gl/react-google-maps` ─────────────────────

/**
 * Returns a module shape compatible with `vi.mock` / `vi.doMock`.
 *
 *   vi.mock("@vis.gl/react-google-maps", () => makeVisGlMock());
 *
 * Mount-counting lives in `APIProvider`'s effect so that when the component is
 * unmounted+remounted (e.g. route change in TanStack Router), `mountCount`
 * increments, which is the C1 observable.
 */
export function makeVisGlMock() {
  function APIProvider({
    children,
    libraries,
  }: {
    apiKey: string;
    children: ReactNode;
    libraries?: ReadonlyArray<string>;
  }) {
    React.useEffect(() => {
      mapsMockState.apiProviderMountCount += 1;
      mapsMockState.apiProviderLibrariesHistory.push(libraries);
    }, []);
    return React.createElement(
      "div",
      { "data-testid": "api-provider" },
      children,
    );
  }

  const mapInstance: Record<string, unknown> = {
    setCenter: (pos: unknown) => {
      mapsMockState.mapCalls.push({ method: "setCenter", args: [pos] });
    },
    setZoom: (zoom: unknown) => {
      mapsMockState.mapCalls.push({ method: "setZoom", args: [zoom] });
    },
    panTo: (pos: unknown) => {
      mapsMockState.mapCalls.push({ method: "panTo", args: [pos] });
    },
    fitBounds: (b: unknown, p?: unknown) => {
      mapsMockState.mapCalls.push({ method: "fitBounds", args: [b, p] });
    },
  };

  function Map({
    children,
    style,
    colorScheme,
  }: {
    children?: ReactNode;
    style?: React.CSSProperties;
    colorScheme?: string;
  }) {
    return React.createElement(
      "div",
      {
        "data-testid": "google-map",
        "data-color-scheme": colorScheme,
        style,
      },
      children,
    );
  }

  function AdvancedMarker({ children }: { children?: ReactNode }) {
    return React.createElement("div", { "data-testid": "marker" }, children);
  }

  function useMap() {
    return mapInstance as unknown as google.maps.Map;
  }

  function useMapsLibrary(name: string) {
    const g = (
      globalThis as unknown as {
        google?: { maps?: Record<string, unknown> };
      }
    ).google;
    if (!g?.maps) return null;
    if (name === "places") return g.maps.places;
    if (name === "routes") return g.maps;
    if (name === "geometry")
      return (g.maps as Record<string, unknown>).geometry ?? null;
    if (name === "marker")
      return (g.maps as Record<string, unknown>).marker ?? null;
    if (name === "maps") return g.maps;
    return null;
  }

  return {
    APIProvider,
    Map,
    AdvancedMarker,
    useMap,
    useMapsLibrary,
  };
}
