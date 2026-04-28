import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useCallback, useMemo } from "react";
import { APIProvider, useMapsLibrary } from "@vis.gl/react-google-maps";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PlaceAutocomplete } from "@/components/maps/PlaceAutocomplete";
import { RouteMap } from "@/components/maps/RouteMap";
import type { MapStop } from "@/components/maps/RouteMap";
import { useRoute } from "@/hooks/useRoutes";
import { useDeliveries, useReplaceDeliveries } from "@/hooks/useDeliveries";
import { useDrivers } from "@/hooks/useDrivers";
import { useVehicles } from "@/hooks/useVehicles";
import type { DeliveryAddress, Delivery } from "@/types/delivery";
import type { Route as RouteType } from "@/types/route";
import { RouteStatus } from "@/types/route";

// ─── Route definition ────────────────────────────────────────────────────────

export const Route = createFileRoute("/_authenticated/routes_/$routeId")({
  component: RoutePlannerPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────

interface StopDraft {
  /** Stable React key */
  _key: string;
  recipientName: string;
  /** Full formatted address string shown in the input */
  addressText: string;
  lat: number | null;
  lng: number | null;
  notes: string;
}

// ─── Status labels ────────────────────────────────────────────────────────────

const statusLabels: Record<string, string> = {
  [RouteStatus.Pending]: "Pendente",
  [RouteStatus.Active]: "Ativa",
  [RouteStatus.Completed]: "Concluída",
  [RouteStatus.Cancelled]: "Cancelada",
};

const statusVariants: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  [RouteStatus.Pending]: "secondary",
  [RouteStatus.Active]: "default",
  [RouteStatus.Completed]: "outline",
  [RouteStatus.Cancelled]: "destructive",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

let keyCounter = 0;
function newKey() {
  return `stop-${++keyCounter}-${Date.now()}`;
}

function emptyStop(): StopDraft {
  return {
    _key: newKey(),
    recipientName: "",
    addressText: "",
    lat: null,
    lng: null,
    notes: "",
  };
}

// ─── Stop card ────────────────────────────────────────────────────────────────

interface StopCardProps {
  stop: StopDraft;
  index: number;
  total: number;
  onChange: (updates: Partial<StopDraft>) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function StopCard({
  stop,
  index,
  total,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
}: StopCardProps) {
  const onPlaceSelect = useCallback(
    (place: { formattedAddress: string; lat: number; lng: number }) => {
      onChange({
        addressText: place.formattedAddress,
        lat: place.lat,
        lng: place.lng,
      });
    },
    [onChange],
  );

  return (
    <div className="rounded-lg border bg-card p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
          {index + 1}
        </span>

        <Input
          value={stop.recipientName}
          onChange={(e) => onChange({ recipientName: e.target.value })}
          placeholder="Nome do destinatário"
          className="flex-1 h-8 text-sm"
        />

        <div className="flex items-center gap-1 shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={index === 0}
            onClick={onMoveUp}
            title="Mover para cima"
          >
            <ChevronUp className="h-3 w-3" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={index === total - 1}
            onClick={onMoveDown}
            title="Mover para baixo"
          >
            <ChevronDown className="h-3 w-3" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={onDelete}
            title="Remover parada"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <PlaceAutocomplete
        value={stop.addressText}
        onChange={(text) =>
          onChange({ addressText: text, lat: null, lng: null })
        }
        onPlaceSelect={onPlaceSelect}
        placeholder="Endereço (busque e selecione)"
      />

      <Input
        value={stop.notes}
        onChange={(e) => onChange({ notes: e.target.value })}
        placeholder="Observações (opcional)"
        className="h-8 text-sm"
      />

      {stop.lat !== null && (
        <p className="text-xs text-muted-foreground truncate">
          📍 {stop.addressText}
        </p>
      )}
    </div>
  );
}

// ─── Optimizer hook ───────────────────────────────────────────────────────────

function useOptimizer() {
  const routesLib = useMapsLibrary("routes");

  const optimize = useCallback(
    async (stops: StopDraft[]): Promise<StopDraft[] | null> => {
      const validStops = stops.filter((s) => s.lat !== null && s.lng !== null);
      if (!routesLib || validStops.length < 3) return null;

      return new Promise((resolve) => {
        const service = new routesLib.DirectionsService();
        service.route(
          {
            origin: new google.maps.LatLng(
              validStops[0].lat!,
              validStops[0].lng!,
            ),
            destination: new google.maps.LatLng(
              validStops[validStops.length - 1].lat!,
              validStops[validStops.length - 1].lng!,
            ),
            waypoints: validStops.slice(1, -1).map((s) => ({
              location: new google.maps.LatLng(s.lat!, s.lng!),
              stopover: true,
            })),
            optimizeWaypoints: true,
            travelMode: routesLib.TravelMode.DRIVING,
          },
          (result, status) => {
            if (status !== "OK" || !result) {
              resolve(null);
              return;
            }
            const order = result.routes[0].waypoint_order;
            const middle = validStops.slice(1, -1);
            const reordered = [
              validStops[0],
              ...order.map((i) => middle[i]),
              validStops[validStops.length - 1],
            ];
            resolve(reordered);
          },
        );
      });
    },
    [routesLib],
  );

  return { optimize, ready: !!routesLib };
}

// ─── PlannerContent — receives already-loaded data, no effects needed ─────────

interface PlannerContentProps {
  routeId: string;
  route: RouteType;
  initialDeliveries: Delivery[];
}

function PlannerContent({
  routeId,
  route,
  initialDeliveries,
}: PlannerContentProps) {
  const navigate = useNavigate();
  const { data: drivers } = useDrivers();
  const { data: vehicles } = useVehicles();
  const replaceDeliveries = useReplaceDeliveries(routeId);
  const { optimize, ready: optimizerReady } = useOptimizer();

  // Lazy initializer — runs once on mount, no effect needed
  const [stops, setStops] = useState<StopDraft[]>(() =>
    initialDeliveries.length > 0
      ? initialDeliveries.map((d) => ({
          _key: d.id,
          recipientName: d.recipientName,
          addressText: d.address.street,
          lat: d.address.lat,
          lng: d.address.lng,
          notes: d.notes,
        }))
      : [emptyStop()],
  );

  // mapDistance is set by the Directions API after rendering.
  // Falls back to the value stored in Firestore until the map computes one.
  const [mapDistance, setMapDistance] = useState<number | null>(null);
  const estimatedDistance = mapDistance ?? route.estimatedDistance ?? 0;
  const [optimizing, setOptimizing] = useState(false);
  const [savedMessage, setSavedMessage] = useState(false);

  // ── Stop mutations ─────────────────────────────────────────────────────────

  const updateStop = useCallback(
    (index: number, updates: Partial<StopDraft>) => {
      setStops((prev) =>
        prev.map((s, i) => (i === index ? { ...s, ...updates } : s)),
      );
    },
    [],
  );

  const addStop = () => setStops((prev) => [...prev, emptyStop()]);

  const removeStop = (index: number) => {
    setStops((prev) => prev.filter((_, i) => i !== index));
  };

  const moveStop = (from: number, to: number) => {
    setStops((prev) => {
      const arr = [...prev];
      const [item] = arr.splice(from, 1);
      arr.splice(to, 0, item);
      return arr;
    });
  };

  // ── Optimize ───────────────────────────────────────────────────────────────

  const handleOptimize = async () => {
    setOptimizing(true);
    const reordered = await optimize(stops);
    setOptimizing(false);
    if (reordered) setStops(reordered);
  };

  // ── Save ───────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    const stopInputs = stops
      .filter((s) => s.recipientName.trim() || s.addressText.trim())
      .map((s) => ({
        recipientName: s.recipientName.trim() || "Sem nome",
        address: {
          street: s.addressText,
          city: "",
          state: "",
          zipCode: "",
          lat: s.lat,
          lng: s.lng,
        } satisfies DeliveryAddress,
        notes: s.notes,
      }));

    await replaceDeliveries.mutateAsync({
      stops: stopInputs,
      routeUpdate: {
        totalDeliveries: stopInputs.length,
        estimatedDistance,
      },
    });

    setSavedMessage(true);
    setTimeout(() => setSavedMessage(false), 3000);
  };

  // ── Derived data ───────────────────────────────────────────────────────────

  const mapStops: MapStop[] = useMemo(() => {
    let idx = 0;
    return stops.flatMap((s) =>
      s.lat !== null && s.lng !== null
        ? [
            {
              lat: s.lat,
              lng: s.lng,
              label: `Parada ${++idx}: ${s.recipientName || "Sem nome"}`,
            },
          ]
        : [],
    );
  }, [stops]);

  const driver = drivers?.find((d) => d.id === route.driverId);
  const vehicle = vehicles?.find((v) => v.id === route.vehicleId);
  const validStopsCount = stops.filter((s) => s.lat !== null).length;
  const canOptimize = optimizerReady && validStopsCount >= 3 && !optimizing;

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden">
      {/* ── Left panel ── */}
      <div className="w-100 shrink-0 border-r flex flex-col overflow-hidden bg-background">
        {/* Header */}
        <div className="p-4 border-b space-y-1 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 -ml-2"
            onClick={() => navigate({ to: "/routes" })}
          >
            <ArrowLeft className="h-4 w-4" />
            Rotas
          </Button>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-semibold leading-tight">
              {route.name}
            </h1>
            <Badge variant={statusVariants[route.status]}>
              {statusLabels[route.status]}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {driver?.name ?? "—"} &bull;{" "}
            {vehicle ? `${vehicle.plate} — ${vehicle.model}` : "—"}
          </p>
          {estimatedDistance > 0 && (
            <p className="text-sm text-muted-foreground">
              Distância estimada: <strong>{estimatedDistance} km</strong>
            </p>
          )}
        </div>

        {/* Stops list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-medium">
              Paradas{" "}
              <span className="text-muted-foreground font-normal">
                ({stops.length})
              </span>
            </h2>
          </div>

          {stops.map((stop, idx) => (
            <StopCard
              key={stop._key}
              stop={stop}
              index={idx}
              total={stops.length}
              onChange={(updates) => updateStop(idx, updates)}
              onDelete={() => removeStop(idx)}
              onMoveUp={() => moveStop(idx, idx - 1)}
              onMoveDown={() => moveStop(idx, idx + 1)}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 border-t space-y-2 shrink-0">
          {savedMessage && (
            <p className="text-sm text-center text-green-600 font-medium">
              ✓ Paradas salvas com sucesso!
            </p>
          )}
          {replaceDeliveries.error && (
            <p className="text-sm text-center text-destructive">
              Erro ao salvar. Tente novamente.
            </p>
          )}

          <Button variant="outline" className="w-full gap-2" onClick={addStop}>
            <Plus className="h-4 w-4" />
            Adicionar Parada
          </Button>

          <Button
            variant="outline"
            className="w-full gap-2"
            disabled={!canOptimize}
            onClick={handleOptimize}
          >
            {optimizing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {optimizing ? "Otimizando..." : "Otimizar Ordem"}
          </Button>

          <Button
            className="w-full"
            disabled={replaceDeliveries.isPending || stops.length === 0}
            onClick={handleSave}
          >
            {replaceDeliveries.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Salvando...
              </>
            ) : (
              "Salvar Paradas"
            )}
          </Button>
        </div>
      </div>

      {/* ── Right panel: map ── */}
      <div className="flex-1 relative">
        {mapStops.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <div className="bg-background/80 backdrop-blur-sm rounded-lg px-4 py-3 text-sm text-muted-foreground text-center shadow">
              Adicione paradas com endereço para visualizar a rota no mapa.
            </div>
          </div>
        )}
        <RouteMap
          stops={mapStops}
          onDistanceChange={setMapDistance}
          className="w-full h-full"
        />
      </div>
    </div>
  );
}

// ─── PlannerLoader — fetches data, shows loading/error, then mounts content ───

function PlannerLoader({ routeId }: { routeId: string }) {
  const navigate = useNavigate();
  const { data: route, isLoading: routeLoading } = useRoute(routeId);
  const { data: deliveries, isLoading: deliveriesLoading } =
    useDeliveries(routeId);

  if (routeLoading || deliveriesLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!route) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-64px)] gap-4">
        <p className="text-muted-foreground">Rota não encontrada.</p>
        <Button variant="outline" onClick={() => navigate({ to: "/routes" })}>
          Voltar para Rotas
        </Button>
      </div>
    );
  }

  // key={routeId} ensures PlannerContent remounts if navigating between routes,
  // so the lazy initializer always reflects the correct deliveries.
  return (
    <PlannerContent
      key={routeId}
      routeId={routeId}
      route={route}
      initialDeliveries={deliveries ?? []}
    />
  );
}

// ─── Page wrapper (provides Maps API) ────────────────────────────────────────

function RoutePlannerPage() {
  const { routeId } = Route.useParams();
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string;

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
    // libraries={["places"]} pre-loads Places for PlaceAutocomplete
    <APIProvider apiKey={apiKey} libraries={["places"]}>
      <PlannerLoader routeId={routeId} />
    </APIProvider>
  );
}
