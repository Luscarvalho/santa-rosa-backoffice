import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { routeKeys } from "@/lib/query-keys";
import * as deliveryService from "@/services/delivery.service";
import type { Delivery } from "@/types/delivery";

export function useDeliveries(routeId: string | undefined) {
  return useQuery({
    queryKey: routeKeys.deliveries(routeId!),
    queryFn: () => deliveryService.getDeliveries(routeId!),
    enabled: !!routeId,
  });
}

export function useDelivery(
  routeId: string | undefined,
  deliveryId: string | undefined,
) {
  return useQuery({
    queryKey: routeKeys.delivery(routeId!, deliveryId!),
    queryFn: () => deliveryService.getDelivery(routeId!, deliveryId!),
    enabled: !!routeId && !!deliveryId,
  });
}

export function useCreateDelivery(routeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      data: Omit<
        Delivery,
        | "id"
        | "createdAt"
        | "updatedAt"
        | "deliveredAt"
        | "deliveryPhoto"
        | "recipientSignature"
        | "failureReason"
        | "attempts"
      >,
    ) => deliveryService.createDelivery(routeId, data),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: routeKeys.deliveries(routeId),
      }),
  });
}

export function useUpdateDelivery(routeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      deliveryId,
      data,
    }: {
      deliveryId: string;
      data: Partial<Omit<Delivery, "id" | "createdAt" | "updatedAt">>;
    }) => deliveryService.updateDelivery(routeId, deliveryId, data),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: routeKeys.deliveries(routeId),
      }),
  });
}

export function useDeleteDelivery(routeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (deliveryId: string) =>
      deliveryService.deleteDelivery(routeId, deliveryId),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: routeKeys.deliveries(routeId),
      }),
  });
}
