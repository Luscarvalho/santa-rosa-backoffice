export const userKeys = {
  all: ["users"] as const,
  detail: (uid: string) => [...userKeys.all, uid] as const,
};
