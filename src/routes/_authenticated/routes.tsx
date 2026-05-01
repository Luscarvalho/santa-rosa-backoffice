import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { MapPin, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  useRoutes,
  useCreateRoute,
  useUpdateRoute,
  useDeleteRoute,
} from "@/hooks/useRoutes";
import { useDrivers } from "@/hooks/useDrivers";
import { useVehicles } from "@/hooks/useVehicles";
import { useAuthStore } from "@/store/auth.store";
import { type Route as RouteType, RouteStatus } from "@/types/route";

export const Route = createFileRoute("/_authenticated/routes")({
  component: RoutesPage,
});

const routeSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  driverId: z.string().min(1, "Motorista é obrigatório"),
  vehicleId: z.string().min(1, "Veículo é obrigatório"),
  status: z.enum([
    RouteStatus.Pending,
    RouteStatus.Active,
    RouteStatus.Completed,
    RouteStatus.Cancelled,
  ]),
  notes: z.string(),
});

type RouteFormData = z.infer<typeof routeSchema>;

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

function RoutesPage() {
  const navigate = useNavigate();
  const uid = useAuthStore((s) => s.uid);
  const { data: routes, isLoading } = useRoutes();
  const createRoute = useCreateRoute();
  const updateRoute = useUpdateRoute();
  const deleteRoute = useDeleteRoute();
  const { data: drivers } = useDrivers();
  const { data: vehicles } = useVehicles();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingRoute, setEditingRoute] = useState<RouteType | null>(null);

  const form = useForm<RouteFormData>({
    resolver: zodResolver(routeSchema),
    defaultValues: {
      name: "",
      driverId: "",
      vehicleId: "",
      status: RouteStatus.Pending,
      notes: "",
    },
  });

  const onSubmit = async (data: RouteFormData) => {
    if (editingRoute) {
      const { dirtyFields } = form.formState;
      const changed = Object.fromEntries(
        Object.keys(dirtyFields).map((k) => [
          k,
          data[k as keyof RouteFormData],
        ]),
      ) as Partial<RouteFormData>;
      if (Object.keys(changed).length > 0) {
        await updateRoute.mutateAsync({ id: editingRoute.id, data: changed });
      }
      handleOpenChange(false);
    } else {
      const id = await createRoute.mutateAsync({ ...data, createdBy: uid! });
      handleOpenChange(false);
      navigate({ to: "/routes/$routeId", params: { routeId: id } });
    }
  };

  const handleEdit = (route: RouteType) => {
    setEditingRoute(route);
    form.reset({
      name: route.name,
      driverId: route.driverId,
      vehicleId: route.vehicleId,
      status: route.status,
      notes: route.notes,
    });
    setIsDialogOpen(true);
  };

  const handleOpenChange = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open) {
      setEditingRoute(null);
      form.reset();
      createRoute.reset();
      updateRoute.reset();
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("Tem certeza que deseja excluir esta rota?")) {
      await deleteRoute.mutateAsync(id);
    }
  };

  const filtered = routes?.filter((r) =>
    r.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Rotas</h1>
          <p className="text-muted-foreground">Gerencie as rotas de entrega.</p>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={handleOpenChange}>
          <DialogTrigger render={<Button />}>
            <Plus className="h-4 w-4" /> Nova Rota
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingRoute ? "Editar Rota" : "Nova Rota"}
              </DialogTitle>
              <DialogDescription>
                {editingRoute
                  ? "Edite as informações da rota."
                  : "Crie uma nova rota de entrega."}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FieldGroup>
                <Controller
                  name="name"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel>Nome</FieldLabel>
                      <Input
                        {...field}
                        placeholder="Rota Centro - 27/04"
                        aria-invalid={fieldState.invalid}
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <Controller
                    name="driverId"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel>Motorista</FieldLabel>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <SelectTrigger>
                            <SelectValue>
                              {(() => {
                                const d = drivers?.find(
                                  (d) => d.id === field.value,
                                );
                                return d ? d.name : "Selecione";
                              })()}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {drivers?.map((d) => (
                              <SelectItem key={d.id} value={d.id}>
                                {d.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />

                  <Controller
                    name="vehicleId"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel>Veículo</FieldLabel>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <SelectTrigger>
                            <SelectValue>
                              {(() => {
                                const v = vehicles?.find(
                                  (v) => v.id === field.value,
                                );
                                return v
                                  ? `${v.plate} — ${v.model}`
                                  : "Selecione";
                              })()}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {vehicles?.map((v) => (
                              <SelectItem key={v.id} value={v.id}>
                                {v.plate} — {v.model}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />
                </div>

                <Controller
                  name="status"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel>Status</FieldLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger>
                          <SelectValue>
                            {statusLabels[field.value] ?? "Selecione"}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={RouteStatus.Pending}>
                            Pendente
                          </SelectItem>
                          <SelectItem value={RouteStatus.Active}>
                            Ativa
                          </SelectItem>
                          <SelectItem value={RouteStatus.Completed}>
                            Concluída
                          </SelectItem>
                          <SelectItem value={RouteStatus.Cancelled}>
                            Cancelada
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />

                <Controller
                  name="notes"
                  control={form.control}
                  render={({ field }) => (
                    <Field>
                      <FieldLabel>Observações</FieldLabel>
                      <Input
                        {...field}
                        placeholder="Ex: Cuidado com o portão da loja 3"
                      />
                    </Field>
                  )}
                />
              </FieldGroup>

              {(createRoute.error || updateRoute.error) && (
                <div className="rounded-md bg-red-50 p-3">
                  <p className="text-sm text-red-500">
                    Ocorreu um erro ao salvar a rota.
                  </p>
                </div>
              )}

              <DialogFooter>
                <DialogClose
                  render={<Button variant="outline" type="button" />}
                >
                  Cancelar
                </DialogClose>
                <Button
                  type="submit"
                  disabled={
                    createRoute.isPending ||
                    updateRoute.isPending ||
                    (editingRoute !== null && !form.formState.isDirty)
                  }
                >
                  {createRoute.isPending || updateRoute.isPending
                    ? "Salvando..."
                    : "Salvar"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar rotas..."
          className="pl-8"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Motorista</TableHead>
                <TableHead>Veículo</TableHead>
                <TableHead>Entregas</TableHead>
                <TableHead>Distância</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-36">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center h-24">
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : !filtered?.length ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center h-24 text-muted-foreground"
                  >
                    Nenhuma rota encontrada.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((route) => {
                  const driver = drivers?.find((d) => d.id === route.driverId);
                  const vehicle = vehicles?.find(
                    (v) => v.id === route.vehicleId,
                  );
                  return (
                    <TableRow key={route.id}>
                      <TableCell className="font-medium">
                        {route.name}
                      </TableCell>
                      <TableCell>{driver?.name ?? "—"}</TableCell>
                      <TableCell>
                        {vehicle ? `${vehicle.plate} — ${vehicle.model}` : "—"}
                      </TableCell>
                      <TableCell>
                        {route.completedDeliveries}/{route.totalDeliveries}
                      </TableCell>
                      <TableCell>{route.estimatedDistance} km</TableCell>
                      <TableCell>
                        <Badge variant={statusVariants[route.status]}>
                          {statusLabels[route.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            title="Planejar paradas"
                            onClick={() =>
                              navigate({
                                to: "/routes/$routeId",
                                params: { routeId: route.id },
                              })
                            }
                          >
                            <MapPin className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => handleEdit(route)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="text-red-500 hover:text-red-600"
                            disabled={deleteRoute.isPending}
                            onClick={() => handleDelete(route.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
