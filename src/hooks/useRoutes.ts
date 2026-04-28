import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { routeKeys } from "@/lib/query-keys";
import * as routeService from "@/services/route.service";
import type { Route } from "@/types/route";

export function useRoutes() {
  return useQuery({
    queryKey: routeKeys.all,
    queryFn: routeService.getRoutes,
  });
}

export function useRoute(id: string | undefined) {
  return useQuery({
    queryKey: routeKeys.detail(id!),
    queryFn: () => routeService.getRoute(id!),
    enabled: !!id,
  });
}

export function useCreateRoute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      data: Omit<
        Route,
        | "id"
        | "createdAt"
        | "updatedAt"
        | "startedAt"
        | "completedAt"
        | "completedDeliveries"
        | "totalDeliveries"
        | "estimatedDistance"
      >,
    ) => routeService.createRoute(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: routeKeys.all }),
  });
}

export function useUpdateRoute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Partial<Omit<Route, "id" | "createdAt" | "updatedAt">>;
    }) => routeService.updateRoute(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: routeKeys.all }),
  });
}

export function useDeleteRoute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => routeService.deleteRoute(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: routeKeys.all }),
  });
}
