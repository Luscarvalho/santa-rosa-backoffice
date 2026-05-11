/**
 * AutocompleteAdapter — session-aware wrapper over the Google Places API.
 *
 * Implements the Per-Session billing model by:
 *   1. Lazily generating an `AutocompleteSessionToken` on the first `start()` call.
 *   2. Passing that token to every prediction request (`AutocompleteService.getPlacePredictions`).
 *   3. Passing the same token to `PlacesService.getDetails` in `select()`.
 *   4. Discarding the token after `select()` so the next `start()` opens a new session.
 *
 * When `VITE_USE_NEW_PLACES=1` and the Places library exposes `PlaceAutocompleteElement`
 * or `Place` (Places API New bindings), the factory switches to `NewPlacesAdapter`.
 * If those bindings are absent, it falls back to `LegacyAutocompleteAdapter` with a
 * `console.warn` so the consumer is never broken.
 *
 * This fixes Bug Condition C2:
 *   C(X) ramo `autocomplete_keystroke ∧ session_token = null`
 *
 * **Validates: Requirements 2.3, 2.4 / Property P2**
 */

import { USE_NEW_PLACES } from "@/lib/env-flags";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface AutocompletePrediction {
  placeId: string;
  description: string;
}

export interface AutocompleteStartOptions {
  input: string;
  /** ISO 3166-1 alpha-2 country code, e.g. "br". */
  country?: string;
  /** Bias bounds for predictions. */
  bounds?: google.maps.LatLngBoundsLiteral;
}

export interface AutocompleteSelection {
  formattedAddress: string;
  lat: number;
  lng: number;
}

export interface AutocompleteAdapter {
  /**
   * Starts or continues a session.
   * Lazily generates a session token on the first call after construction or
   * after the previous session was closed by `select()`.
   */
  start(options: AutocompleteStartOptions): Promise<AutocompletePrediction[]>;

  /**
   * Completes the current session.
   * Fetches place details using the active session token, then discards it so
   * the next `start()` opens a fresh billing session.
   */
  select(placeId: string): Promise<AutocompleteSelection>;

  /** Which Places API backend is in use. */
  readonly backend: "places-new" | "places-legacy";

  /** Release any held resources (e.g. the PlacesService attribution node). */
  dispose(): void;
}

// ─── Places library type shim ─────────────────────────────────────────────────
// `@vis.gl/react-google-maps` exposes the library as `google.maps.PlacesLibrary`
// but the TypeScript types may not be fully available in all setups. We use a
// minimal structural type so the adapter compiles without requiring the full
// `@types/google.maps` package to be present.

type PlacesLibrary = {
  AutocompleteService: new () => google.maps.places.AutocompleteService;
  AutocompleteSessionToken: new () => google.maps.places.AutocompleteSessionToken;
  PlacesService: new (
    attrContainer: HTMLDivElement,
  ) => google.maps.places.PlacesService;
  PlacesServiceStatus: typeof google.maps.places.PlacesServiceStatus;
};

/**
 * Minimal structural type for the Places API (New) bindings.
 * The new API exposes `Place` and optionally `PlaceAutocompleteElement`.
 * We only require the subset we actually use so the adapter compiles even
 * when the full `@types/google.maps` types are not present.
 */
type NewPlacesLibrary = PlacesLibrary & {
  /** Places API (New) — `google.maps.places.Place` */
  Place?: unknown;
  /** Web-component element exposed by Places API (New) */
  PlaceAutocompleteElement?: unknown;
};

// ─── Helper: detect new Places API bindings ───────────────────────────────────

/**
 * Returns `true` when the library object exposes at least one of the
 * Places API (New) entry-points (`PlaceAutocompleteElement` or `Place`).
 */
function hasNewPlacesBindings(lib: NewPlacesLibrary): boolean {
  return lib.PlaceAutocompleteElement != null || lib.Place != null;
}

// ─── Legacy backend implementation ───────────────────────────────────────────

class LegacyAutocompleteAdapter implements AutocompleteAdapter {
  readonly backend = "places-legacy" as const;

  private readonly placesLib: PlacesLibrary;
  private readonly autocompleteService: google.maps.places.AutocompleteService;
  private readonly placesService: google.maps.places.PlacesService;
  /** Attribution node required by PlacesService — kept off-screen. */
  private readonly attrNode: HTMLDivElement;
  /** Active session token; null means no session has started yet. */
  private sessionToken: google.maps.places.AutocompleteSessionToken | null =
    null;

  constructor(placesLib: PlacesLibrary) {
    // Field assignments are explicit (avoids TS parameter-property syntax
    // which is disallowed under `erasableSyntaxOnly`).
    this.placesLib = placesLib;
    this.autocompleteService = new placesLib.AutocompleteService();
    // PlacesService requires a DOM node for attribution rendering.
    this.attrNode = document.createElement("div");
    this.attrNode.style.display = "none";
    document.body.appendChild(this.attrNode);
    this.placesService = new placesLib.PlacesService(this.attrNode);
  }

  /**
   * Returns predictions for `input`, creating a session token lazily on the
   * first call (or after the previous session was closed by `select()`).
   */
  start(options: AutocompleteStartOptions): Promise<AutocompletePrediction[]> {
    // Lazy token creation — this is the key fix for C2.
    if (this.sessionToken === null) {
      this.sessionToken = new this.placesLib.AutocompleteSessionToken();
    }

    const request: google.maps.places.AutocompletionRequest = {
      input: options.input,
      sessionToken: this.sessionToken,
    };

    if (options.country) {
      request.componentRestrictions = { country: options.country };
    }

    if (options.bounds) {
      request.bounds = options.bounds;
    }

    return new Promise((resolve) => {
      // Let TS infer the callback param types from the SDK signature.
      // Declaring them explicitly as `PlacesServiceStatus` (enum) collides
      // with the SDK's literal-union signature under strict mode.
      this.autocompleteService.getPlacePredictions(request, (predictions, status) => {
        if (status !== "OK" || !predictions) {
          // Return empty list on ZERO_RESULTS or other non-fatal statuses.
          resolve([]);
          return;
        }
        resolve(
          predictions.map((p) => ({
            placeId: p.place_id,
            description: p.description,
          })),
        );
      });
    });
  }

  /**
   * Fetches place details and closes the current billing session by discarding
   * the session token.
   */
  select(placeId: string): Promise<AutocompleteSelection> {
    const tokenForRequest = this.sessionToken;
    // Discard the token immediately — the session is now closed regardless of
    // whether the getDetails call succeeds.
    this.sessionToken = null;

    return new Promise((resolve, reject) => {
      const request: google.maps.places.PlaceDetailsRequest = {
        placeId,
        fields: ["formatted_address", "geometry"],
      };

      // Pass the session token if one was active; this groups the getDetails
      // call into the same billing session as the preceding predictions.
      if (tokenForRequest !== null) {
        request.sessionToken = tokenForRequest;
      }

      this.placesService.getDetails(request, (place, status) => {
        if (status !== "OK") {
          reject(new Error(`PlacesService.getDetails failed: ${status}`));
          return;
        }

        if (!place?.geometry?.location || !place.formatted_address) {
          reject(new Error("PlacesService.getDetails: incomplete result"));
          return;
        }

        resolve({
          formattedAddress: place.formatted_address,
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
        });
      });
    });
  }

  dispose(): void {
    this.sessionToken = null;
    // Remove the attribution node from the DOM.
    if (this.attrNode.parentNode) {
      this.attrNode.parentNode.removeChild(this.attrNode);
    }
  }
}

// ─── New Places backend (stub — delegates to legacy) ─────────────────────────

/**
 * Stub adapter for the Places API (New) backend.
 *
 * The full Places API (New) migration (using `PlaceAutocompleteElement` or
 * `Place.fetchFields`) is deferred to a follow-up spec. This stub:
 *   - Reports `backend = "places-new"` because the **billing semantics** are
 *     already those of the Per-Session model (session token is applied via
 *     the delegate). The SDK surface is still legacy until the follow-up lands.
 *   - Delegates all actual work to a `LegacyAutocompleteAdapter` instance.
 *   - Logs a single `console.info` on construction to confirm the new backend
 *     path is active (useful for staging validation).
 *
 * When the full implementation lands, only this class needs to change — the
 * factory and all consumers remain untouched.
 */
class NewPlacesAdapter implements AutocompleteAdapter {
  readonly backend = "places-new" as const;

  private readonly delegate: LegacyAutocompleteAdapter;

  constructor(placesLib: PlacesLibrary) {
    this.delegate = new LegacyAutocompleteAdapter(placesLib);
    // Single informational log so staging testers can confirm the flag is active.
    console.info(
      "[PlaceAutocompleteAdapter] Using places-new backend (VITE_USE_NEW_PLACES=1). " +
        "Full Places API (New) implementation is pending — delegating to legacy session adapter.",
    );
  }

  start(options: AutocompleteStartOptions): Promise<AutocompletePrediction[]> {
    return this.delegate.start(options);
  }

  select(placeId: string): Promise<AutocompleteSelection> {
    return this.delegate.select(placeId);
  }

  dispose(): void {
    this.delegate.dispose();
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Creates an `AutocompleteAdapter` backed by the appropriate Places API backend.
 *
 * **Backend selection logic:**
 * 1. If `VITE_USE_NEW_PLACES=1` AND the library exposes `PlaceAutocompleteElement`
 *    or `Place` (Places API New bindings) → returns a `NewPlacesAdapter`.
 * 2. If `VITE_USE_NEW_PLACES=1` but the new bindings are absent → logs a warning
 *    and falls back to `LegacyAutocompleteAdapter` silently.
 * 3. Otherwise (flag is off) → returns `LegacyAutocompleteAdapter` directly.
 *
 * In all cases the consumer receives an `AutocompleteAdapter` with the same
 * public interface, so no re-touch of `PlaceAutocomplete.tsx` is needed.
 *
 * Pass the `placesLib` value returned by `useMapsLibrary("places")`.
 *
 * @example
 * ```ts
 * const placesLib = useMapsLibrary("places");
 * const adapter = useMemo(
 *   () => placesLib ? createAutocompleteAdapter(placesLib) : null,
 *   [placesLib],
 * );
 * ```
 */
export function createAutocompleteAdapter(
  placesLib: google.maps.PlacesLibrary,
): AutocompleteAdapter {
  const lib = placesLib as unknown as NewPlacesLibrary;

  if (USE_NEW_PLACES) {
    if (hasNewPlacesBindings(lib)) {
      return new NewPlacesAdapter(lib);
    }
    // Flag is on but the SDK hasn't loaded the new bindings yet (e.g. the
    // Places API (New) is not enabled in the GCP project, or the library
    // version predates the new API). Fall back gracefully.
    console.warn(
      "[PlaceAutocompleteAdapter] VITE_USE_NEW_PLACES=1 but " +
        "PlaceAutocompleteElement / Place bindings are not available in the " +
        "loaded Places library. Falling back to places-legacy silently. " +
        "Ensure 'Places API (New)' is enabled in your GCP project and that " +
        "the Maps JS SDK version supports it.",
    );
  }

  return new LegacyAutocompleteAdapter(lib);
}
