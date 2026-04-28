export const userKeys = {
  all: ["users"] as const,
  detail: (uid: string) => [...userKeys.all, uid] as const,
};

export const vehicleKeys = {
  all: ["vehicles"] as const,
  detail: (id: string) => [...vehicleKeys.all, id] as const,
};

export const driverKeys = {
  all: ["drivers"] as const,
  detail: (id: string) => [...driverKeys.all, id] as const,
};

export const routeKeys = {
  all: ["routes"] as const,
  detail: (id: string) => [...routeKeys.all, id] as const,
  deliveries: (routeId: string) =>
    [...routeKeys.detail(routeId), "deliveries"] as const,
  delivery: (routeId: string, deliveryId: string) =>
    [...routeKeys.deliveries(routeId), deliveryId] as const,
};
