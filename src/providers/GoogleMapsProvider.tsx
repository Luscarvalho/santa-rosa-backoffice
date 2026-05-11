import { APIProvider } from "@vis.gl/react-google-maps";
import type { ReactNode } from "react";

type MapsLibrary = "places" | "routes" | "geometry" | "marker";

/**
 * Fixed set of Maps JS libraries loaded once per session by the shared
 * `<APIProvider>`. Keeping this stable across routes is what lets the SDK
 * reuse a single Maps JS boot (see spec P1: `maps_js_loads_per_session ≤ 1`).
 */
const DEFAULT_LIBRARIES = [
  "places",
  "routes",
  "geometry",
  "marker",
] as const satisfies ReadonlyArray<MapsLibrary>;

export interface GoogleMapsProviderProps {
  /**
   * Google Maps JS API key. Typed as `string | undefined` because
   * `import.meta.env.VITE_GOOGLE_MAPS_API_KEY` may be missing in dev; the
   * provider renders a config message instead of the map in that case.
   */
  apiKey: string | undefined;
  children: ReactNode;
}

/**
 * Shared wrapper around `<APIProvider>` from `@vis.gl/react-google-maps`.
 *
 * Mounted once in the authenticated layout so navigating between map-bearing
 * routes does not remount the provider and re-download the Maps JS SDK.
 *
 * When `apiKey` is missing/empty, renders a config message instead of the
 * provider — migrated from the previous per-route guard in
 * `routes_.$routeId.tsx` so the planner still surfaces the same instruction.
 */
export function GoogleMapsProvider({
  apiKey,
  children,
}: GoogleMapsProviderProps) {
  if (!apiKey) {
    return (
      <div className="p-8 text-center space-y-2">
        <p className="font-semibold">Configuração necessária</p>
        <p className="text-sm text-muted-foreground">
          Adicione <code className="font-mono">VITE_GOOGLE_MAPS_API_KEY</code>{" "}
          ao <code className="font-mono">.env</code> para usar o planejador.
        </p>
      </div>
    );
  }

  return (
    <APIProvider apiKey={apiKey} libraries={[...DEFAULT_LIBRARIES]}>
      {children}
    </APIProvider>
  );
}
