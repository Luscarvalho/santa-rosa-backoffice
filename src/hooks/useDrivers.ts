import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { driverKeys } from "@/lib/query-keys";
import * as driverService from "@/services/driver.service";
import type { Driver } from "@/types/driver";

export function useDrivers() {
  return useQuery({
    queryKey: driverKeys.all,
    queryFn: driverService.getDrivers,
  });
}

export function useDriver(id: string | undefined) {
  return useQuery({
    queryKey: driverKeys.detail(id!),
    queryFn: () => driverService.getDriver(id!),
    enabled: !!id,
  });
}

export function useCreateDriver() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      data: Omit<Driver, "id" | "createdAt" | "updatedAt" | "fcmToken">,
    ) => driverService.createDriver(data),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: driverKeys.all }),
  });
}

export function useUpdateDriver() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Partial<Omit<Driver, "id" | "createdAt" | "updatedAt">>;
    }) => driverService.updateDriver(id, data),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: driverKeys.all }),
  });
}

export function useDeleteDriver() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => driverService.deleteDriver(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: driverKeys.all }),
  });
}
