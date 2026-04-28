import { useAuthStore } from "@/store/auth.store";
import { useUserDoc } from "@/hooks/useUserDoc";

export function useCurrentUserProfile() {
  const uid = useAuthStore((s) => s.uid);
  const { data: profile } = useUserDoc(uid ?? undefined);

  return {
    name: profile?.name ?? null,
    email: profile?.email ?? null,
    role: profile?.role ?? null,
  };
}
