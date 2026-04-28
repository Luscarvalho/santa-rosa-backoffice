import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { vehicleKeys } from "@/lib/query-keys";
import * as vehicleService from "@/services/vehicle.service";
import type { Vehicle } from "@/types/vehicle";

export function useVehicles() {
  return useQuery({
    queryKey: vehicleKeys.all,
    queryFn: vehicleService.getVehicles,
  });
}

export function useVehicle(id: string | undefined) {
  return useQuery({
    queryKey: vehicleKeys.detail(id!),
    queryFn: () => vehicleService.getVehicle(id!),
    enabled: !!id,
  });
}

export function useCreateVehicle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<Vehicle, "id" | "createdAt" | "updatedAt">) =>
      vehicleService.createVehicle(data),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: vehicleKeys.all }),
  });
}

export function useUpdateVehicle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Partial<Omit<Vehicle, "id" | "createdAt">>;
    }) => vehicleService.updateVehicle(id, data),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: vehicleKeys.all }),
  });
}

export function useDeleteVehicle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => vehicleService.deleteVehicle(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: vehicleKeys.all }),
  });
}
