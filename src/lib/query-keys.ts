export const userKeys = {
  all: ["users"] as const,
  detail: (uid: string) => [...userKeys.all, uid] as const,
};

export const productKeys = {
  all: ["products"] as const,
  list: (filters?: Record<string, unknown>) =>
    [...productKeys.all, "list", filters] as const,
  detail: (id: string) => [...productKeys.all, id] as const,
};
