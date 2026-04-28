import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { APIProvider } from "@vis.gl/react-google-maps";
import { Radio, Truck, Gauge, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { TrackingMap } from "@/components/maps/TrackingMap";
import { useDriverLocations } from "@/hooks/useDriverLocations";
import { useDrivers } from "@/hooks/useDrivers";
import { useRoutes } from "@/hooks/useRoutes";
import type { DriverLocation } from "@/types/location";

export const Route = createFileRoute("/_authenticated/tracking")({
  component: TrackingPage,
});

function TrackingPage() {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string;

  return (
    <APIProvider apiKey={apiKey}>
      <TrackingContent />
    </APIProvider>
  );
}

function TrackingContent() {
  const locations = useDriverLocations();
  const { data: drivers } = useDrivers();
  const { data: routes } = useRoutes();

  const driverNames = useMemo(() => {
    const map: Record<string, string> = {};
    drivers?.forEach((d) => {
      map[d.id] = d.name;
    });
    return map;
  }, [drivers]);

  const routeNames = useMemo(() => {
    const map: Record<string, string> = {};
    routes?.forEach((r) => {
      map[r.id] = r.name;
    });
    return map;
  }, [routes]);

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden -m-6">
      {/* Sidebar - Driver list */}
      <div className="w-80 shrink-0 border-r flex flex-col overflow-hidden bg-background">
        <div className="p-4 border-b">
          <div className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-bold">Rastreamento ao Vivo</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {locations.length === 0
              ? "Nenhum motorista ativo"
              : `${locations.length} motorista${locations.length > 1 ? "s" : ""} em rota`}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {locations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm text-center px-4">
              <Truck className="h-12 w-12 mb-3 opacity-40" />
              <p>Nenhum motorista está transmitindo localização no momento.</p>
            </div>
          ) : (
            locations.map((loc) => (
              <DriverCard
                key={loc.driverId}
                location={loc}
                driverName={driverNames[loc.driverId]}
                routeName={routeNames[loc.routeId]}
              />
            ))
          )}
        </div>
      </div>

      {/* Map */}
      <div className="flex-1">
        <TrackingMap
          locations={locations}
          driverNames={driverNames}
          className="h-full w-full"
        />
      </div>
    </div>
  );
}

// ─── Driver card ──────────────────────────────────────────────────────────────

function DriverCard({
  location,
  driverName,
  routeName,
}: {
  location: DriverLocation;
  driverName: string | undefined;
  routeName: string | undefined;
}) {
  const ago = formatTimeAgo(location.updatedAt?.toDate());
  const isStale = isLocationStale(location.updatedAt?.toDate());

  return (
    <Card className={isStale ? "opacity-60" : ""}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Truck className="h-4 w-4 shrink-0 text-primary" />
            <span className="font-medium text-sm truncate">
              {driverName ?? "Motorista"}
            </span>
          </div>
          <Badge
            variant={isStale ? "destructive" : "default"}
            className="text-xs shrink-0"
          >
            {isStale ? "Inativo" : "Ativo"}
          </Badge>
        </div>

        {routeName && (
          <p className="text-xs text-muted-foreground truncate">
            Rota: {routeName}
          </p>
        )}

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Gauge className="h-3 w-3" />
            {Math.round(location.speed)} km/h
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {ago}
          </span>
        </div>
      </CardContent>
    </Card>
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

function isLocationStale(date: Date | undefined): boolean {
  if (!date) return true;
  return Date.now() - date.getTime() > 5 * 60 * 1000; // 5 minutes
}
