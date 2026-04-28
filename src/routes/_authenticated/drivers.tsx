import { createFileRoute } from "@tanstack/react-router";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { Timestamp } from "firebase/firestore";
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
  useDrivers,
  useCreateDriver,
  useUpdateDriver,
  useDeleteDriver,
} from "@/hooks/useDrivers";
import { useVehicles } from "@/hooks/useVehicles";
import { type Driver, DriverStatus } from "@/types/driver";

export const Route = createFileRoute("/_authenticated/drivers")({
  component: DriversPage,
});

const driverSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  email: z.string().email("Email inválido"),
  phone: z.string().min(1, "Telefone é obrigatório"),
  licenseNumber: z.string().min(1, "CNH é obrigatória"),
  licenseExpiry: z.string().min(1, "Validade da CNH é obrigatória"),
  vehicleId: z.string(),
  status: z.enum([
    DriverStatus.Available,
    DriverStatus.OnRoute,
    DriverStatus.Offline,
  ]),
});

type DriverFormData = z.infer<typeof driverSchema>;

const statusLabels: Record<string, string> = {
  [DriverStatus.Available]: "Disponível",
  [DriverStatus.OnRoute]: "Em rota",
  [DriverStatus.Offline]: "Offline",
};

const statusVariants: Record<string, "default" | "secondary" | "destructive"> =
  {
    [DriverStatus.Available]: "default",
    [DriverStatus.OnRoute]: "secondary",
    [DriverStatus.Offline]: "destructive",
  };

function DriversPage() {
  const { data: drivers, isLoading } = useDrivers();
  const createDriver = useCreateDriver();
  const updateDriver = useUpdateDriver();
  const deleteDriver = useDeleteDriver();
  const { data: vehicles } = useVehicles();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);

  const form = useForm<DriverFormData>({
    resolver: zodResolver(driverSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      licenseNumber: "",
      licenseExpiry: "",
      vehicleId: "",
      status: DriverStatus.Available,
    },
  });

  const onSubmit = async (data: DriverFormData) => {
    const payload = {
      ...data,
      vehicleId: data.vehicleId || null,
      licenseExpiry: Timestamp.fromDate(new Date(data.licenseExpiry)),
    };

    if (editingDriver) {
      const { dirtyFields } = form.formState;
      const changed = Object.fromEntries(
        Object.keys(dirtyFields).map((k) => [
          k,
          payload[k as keyof typeof payload],
        ]),
      );
      if (Object.keys(changed).length > 0) {
        await updateDriver.mutateAsync({ id: editingDriver.id, data: changed });
      }
    } else {
      await createDriver.mutateAsync(payload);
    }
    handleOpenChange(false);
  };

  const handleEdit = (driver: Driver) => {
    setEditingDriver(driver);
    form.reset({
      name: driver.name,
      email: driver.email,
      phone: driver.phone,
      licenseNumber: driver.licenseNumber,
      licenseExpiry: driver.licenseExpiry.toDate().toISOString().split("T")[0],
      vehicleId: driver.vehicleId ?? "",
      status: driver.status,
    });
    setIsDialogOpen(true);
  };

  const handleOpenChange = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open) {
      setEditingDriver(null);
      form.reset();
      createDriver.reset();
      updateDriver.reset();
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("Tem certeza que deseja excluir este motorista?")) {
      await deleteDriver.mutateAsync(id);
    }
  };

  const filtered = drivers?.filter((d) =>
    `${d.name} ${d.email}`.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Motoristas</h1>
          <p className="text-muted-foreground">
            Gerencie os motoristas da frota.
          </p>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={handleOpenChange}>
          <DialogTrigger render={<Button />}>
            <Plus className="h-4 w-4" /> Novo Motorista
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingDriver ? "Editar Motorista" : "Novo Motorista"}
              </DialogTitle>
              <DialogDescription>
                {editingDriver
                  ? "Edite as informações do motorista."
                  : "Adicione um novo motorista à frota."}
              </DialogDescription>
            </DialogHeader>

            <form
              id="driver-form"
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-4"
            >
              <FieldGroup>
                <Controller
                  name="name"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel>Nome</FieldLabel>
                      <Input
                        {...field}
                        placeholder="João Silva"
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
                    name="email"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel>Email</FieldLabel>
                        <Input
                          {...field}
                          type="email"
                          placeholder="joao@empresa.com"
                          aria-invalid={fieldState.invalid}
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />

                  <Controller
                    name="phone"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel>Telefone</FieldLabel>
                        <Input
                          {...field}
                          placeholder="92999990000"
                          aria-invalid={fieldState.invalid}
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Controller
                    name="licenseNumber"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel>CNH</FieldLabel>
                        <Input
                          {...field}
                          placeholder="12345678900"
                          aria-invalid={fieldState.invalid}
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />

                  <Controller
                    name="licenseExpiry"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel>Validade da CNH</FieldLabel>
                        <Input
                          {...field}
                          type="date"
                          aria-invalid={fieldState.invalid}
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />
                </div>

                <Controller
                  name="vehicleId"
                  control={form.control}
                  render={({ field }) => (
                    <Field>
                      <FieldLabel>Veículo (opcional)</FieldLabel>
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
                                : "Selecione um veículo";
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
                    </Field>
                  )}
                />

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
                          <SelectItem value={DriverStatus.Available}>
                            Disponível
                          </SelectItem>
                          <SelectItem value={DriverStatus.OnRoute}>
                            Em rota
                          </SelectItem>
                          <SelectItem value={DriverStatus.Offline}>
                            Offline
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

              {(createDriver.error || updateDriver.error) && (
                <div className="rounded-md bg-red-50 p-3">
                  <p className="text-sm text-red-500">
                    Ocorreu um erro ao salvar o motorista.
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
                    createDriver.isPending ||
                    updateDriver.isPending ||
                    (editingDriver !== null && !form.formState.isDirty)
                  }
                >
                  {createDriver.isPending || updateDriver.isPending
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
          placeholder="Buscar motoristas..."
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
                <TableHead>Email</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>CNH</TableHead>
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
                    Nenhum motorista encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((driver) => (
                  <TableRow key={driver.id}>
                    <TableCell className="font-medium">{driver.name}</TableCell>
                    <TableCell>{driver.email}</TableCell>
                    <TableCell>{driver.phone}</TableCell>
                    <TableCell>{driver.licenseNumber}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariants[driver.status]}>
                        {statusLabels[driver.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => handleEdit(driver)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="text-red-500 hover:text-red-600"
                          disabled={deleteDriver.isPending}
                          onClick={() => handleDelete(driver.id)}
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
