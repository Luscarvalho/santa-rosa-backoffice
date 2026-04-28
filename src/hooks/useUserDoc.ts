import { useQuery } from "@tanstack/react-query";
import { fetchUserDoc } from "@/services/user.service";
import { userKeys } from "@/lib/query-keys";

export function useUserDoc(uid: string | undefined) {
  return useQuery({
    queryKey: userKeys.detail(uid!),
    queryFn: () => fetchUserDoc(uid!),
    enabled: !!uid,
  });
}
