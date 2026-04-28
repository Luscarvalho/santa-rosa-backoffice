import { createFileRoute } from "@tanstack/react-router";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
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
  useVehicles,
  useCreateVehicle,
  useUpdateVehicle,
  useDeleteVehicle,
} from "@/hooks/useVehicles";
import { type Vehicle, VehicleStatus } from "@/types/vehicle";

export const Route = createFileRoute("/_authenticated/vehicles")({
  component: VehiclesPage,
});

const vehicleSchema = z.object({
  plate: z.string().min(1, "Placa é obrigatória"),
  model: z.string().min(1, "Modelo é obrigatório"),
  year: z
    .number()
    .min(1900, "Ano inválido")
    .max(new Date().getFullYear() + 1, "Ano inválido"),
  capacity: z.number().min(1, "Capacidade deve ser maior que 0"),
  status: z.enum([
    VehicleStatus.Available,
    VehicleStatus.InUse,
    VehicleStatus.Maintenance,
  ]),
});

type VehicleFormData = z.infer<typeof vehicleSchema>;

const statusLabels: Record<string, string> = {
  [VehicleStatus.Available]: "Disponível",
  [VehicleStatus.InUse]: "Em uso",
  [VehicleStatus.Maintenance]: "Manutenção",
};

const statusVariants: Record<string, "default" | "secondary" | "destructive"> =
  {
    [VehicleStatus.Available]: "default",
    [VehicleStatus.InUse]: "secondary",
    [VehicleStatus.Maintenance]: "destructive",
  };

function VehiclesPage() {
  const { data: vehicles, isLoading } = useVehicles();
  const createVehicle = useCreateVehicle();
  const updateVehicle = useUpdateVehicle();
  const deleteVehicle = useDeleteVehicle();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);

  const form = useForm<VehicleFormData>({
    resolver: zodResolver(vehicleSchema),
    defaultValues: {
      plate: "",
      model: "",
      year: new Date().getFullYear(),
      capacity: 0,
      status: VehicleStatus.Available,
    },
  });

  const onSubmit = async (data: VehicleFormData) => {
    if (editingVehicle) {
      const { dirtyFields } = form.formState;
      const changed = Object.fromEntries(
        Object.keys(dirtyFields).map((k) => [
          k,
          data[k as keyof VehicleFormData],
        ]),
      ) as Partial<VehicleFormData>;

      if (Object.keys(changed).length > 0) {
        await updateVehicle.mutateAsync({
          id: editingVehicle.id,
          data: changed,
        });
      }
    } else {
      await createVehicle.mutateAsync({ ...data, currentDriverId: null });
    }
    handleOpenChange(false);
  };

  const handleEdit = (vehicle: Vehicle) => {
    setEditingVehicle(vehicle);
    form.reset({
      plate: vehicle.plate,
      model: vehicle.model,
      year: vehicle.year,
      capacity: vehicle.capacity,
      status: vehicle.status,
    });
    setIsDialogOpen(true);
  };

  const handleOpenChange = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open) {
      setEditingVehicle(null);
      form.reset();
      createVehicle.reset();
      updateVehicle.reset();
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("Tem certeza que deseja excluir este veículo?")) {
      await deleteVehicle.mutateAsync(id);
    }
  };

  const filtered = vehicles?.filter((v) =>
    `${v.plate} ${v.model}`.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Veículos</h1>
          <p className="text-muted-foreground">
            Gerencie os caminhões da frota.
          </p>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={handleOpenChange}>
          <DialogTrigger render={<Button />}>
            <Plus className="h-4 w-4" /> Novo Veículo
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingVehicle ? "Editar Veículo" : "Novo Veículo"}
              </DialogTitle>
              <DialogDescription>
                {editingVehicle
                  ? "Edite as informações do veículo."
                  : "Adicione um novo veículo à frota."}
              </DialogDescription>
            </DialogHeader>

            <form
              id="vehicle-form"
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-4"
            >
              <FieldGroup>
                <Controller
                  name="plate"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel>Placa</FieldLabel>
                      <Input
                        {...field}
                        placeholder="ABC-1234"
                        aria-invalid={fieldState.invalid}
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />

                <Controller
                  name="model"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel>Modelo</FieldLabel>
                      <Input
                        {...field}
                        placeholder="Volvo FH"
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
                    name="year"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel>Ano</FieldLabel>
                        <Input
                          {...field}
                          type="number"
                          aria-invalid={fieldState.invalid}
                          onChange={(e) =>
                            field.onChange(e.target.valueAsNumber)
                          }
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />

                  <Controller
                    name="capacity"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel>Capacidade (kg)</FieldLabel>
                        <Input
                          {...field}
                          type="number"
                          placeholder="10000"
                          aria-invalid={fieldState.invalid}
                          onChange={(e) =>
                            field.onChange(e.target.valueAsNumber)
                          }
                        />
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
                            {statusLabels[field.value] ?? "Selecione o status"}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={VehicleStatus.Available}>
                            Disponível
                          </SelectItem>
                          <SelectItem value={VehicleStatus.InUse}>
                            Em uso
                          </SelectItem>
                          <SelectItem value={VehicleStatus.Maintenance}>
                            Manutenção
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
              </FieldGroup>

              {(createVehicle.error || updateVehicle.error) && (
                <div className="rounded-md bg-red-50 p-3">
                  <p className="text-sm text-red-500">
                    Ocorreu um erro ao salvar o veículo.
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
                    createVehicle.isPending ||
                    updateVehicle.isPending ||
                    (editingVehicle !== null && !form.formState.isDirty)
                  }
                >
                  {createVehicle.isPending || updateVehicle.isPending
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
          placeholder="Buscar veículos..."
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
                <TableHead>Placa</TableHead>
                <TableHead>Modelo</TableHead>
                <TableHead>Ano</TableHead>
                <TableHead>Capacidade (kg)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center h-24">
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : !filtered?.length ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center h-24 text-muted-foreground"
                  >
                    Nenhum veículo encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((vehicle) => (
                  <TableRow key={vehicle.id}>
                    <TableCell className="font-medium">
                      {vehicle.plate}
                    </TableCell>
                    <TableCell>{vehicle.model}</TableCell>
                    <TableCell>{vehicle.year}</TableCell>
                    <TableCell>
                      {vehicle.capacity.toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariants[vehicle.status]}>
                        {statusLabels[vehicle.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => handleEdit(vehicle)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="text-red-500 hover:text-red-600"
                          disabled={deleteVehicle.isPending}
                          onClick={() => handleDelete(vehicle.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
