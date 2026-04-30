import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { APIProvider } from "@vis.gl/react-google-maps";
import { Radio, Truck, Gauge, Clock, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrackingMap } from "@/components/maps/TrackingMap";
import {
  useDriverLocations,
  useDriverTrails,
} from "@/hooks/useDriverLocations";
import { useDrivers } from "@/hooks/useDrivers";
import { useRoutes } from "@/hooks/useRoutes";
import type { DriverLocation } from "@/types/location";
import type { Route as RouteType } from "@/types/route";
import { RouteStatus } from "@/types/route";

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
  const trails = useDriverTrails();
  const { data: drivers } = useDrivers();
  const { data: routes } = useRoutes();
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);

  const driverNames = useMemo(() => {
    const map: Record<string, string> = {};
    drivers?.forEach((d) => {
      map[d.id] = d.name;
    });
    return map;
  }, [drivers]);

  const routeMap = useMemo(() => {
    const map: Record<string, RouteType> = {};
    routes?.forEach((r) => {
      map[r.id] = r;
    });
    return map;
  }, [routes]);

  const selectedLocation = selectedDriverId
    ? locations.find((l) => l.driverId === selectedDriverId)
    : null;

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

        {selectedDriverId && selectedLocation && (
          <div className="p-3 border-b bg-muted/50">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                Seguindo: {driverNames[selectedDriverId] ?? "Motorista"}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setSelectedDriverId(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

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
                route={routeMap[loc.routeId]}
                isSelected={loc.driverId === selectedDriverId}
                onSelect={() =>
                  setSelectedDriverId(
                    loc.driverId === selectedDriverId ? null : loc.driverId,
                  )
                }
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
          selectedDriverId={selectedDriverId}
          trail={selectedDriverId ? (trails[selectedDriverId] ?? []) : []}
          className="h-full w-full"
        />
      </div>
    </div>
  );
}

// ─── Driver card ──────────────────────────────────────────────────────────────

const routeStatusLabels: Record<string, string> = {
  [RouteStatus.Pending]: "Pendente",
  [RouteStatus.Active]: "Ativa",
  [RouteStatus.Completed]: "Concluída",
  [RouteStatus.Cancelled]: "Cancelada",
};

const routeStatusVariants: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  [RouteStatus.Pending]: "secondary",
  [RouteStatus.Active]: "default",
  [RouteStatus.Completed]: "outline",
  [RouteStatus.Cancelled]: "destructive",
};

function DriverCard({
  location,
  driverName,
  route,
  isSelected,
  onSelect,
}: {
  location: DriverLocation;
  driverName: string | undefined;
  route: RouteType | undefined;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const ago = formatTimeAgo(location.updatedAt?.toDate());
  const status = route?.status ?? RouteStatus.Pending;
  const isInactive = status !== RouteStatus.Active;

  return (
    <Card
      className={`cursor-pointer transition-colors ${isInactive ? "opacity-60" : ""} ${isSelected ? "ring-2 ring-primary" : "hover:bg-muted/50"}`}
      onClick={onSelect}
    >
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Truck className="h-4 w-4 shrink-0 text-primary" />
            <span className="font-medium text-sm truncate">
              {driverName ?? "Motorista"}
            </span>
          </div>
          <Badge
            variant={routeStatusVariants[status] ?? "secondary"}
            className="text-xs shrink-0"
          >
            {routeStatusLabels[status] ?? status}
          </Badge>
        </div>

        {route && (
          <p className="text-xs text-muted-foreground truncate">
            Rota: {route.name}
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
