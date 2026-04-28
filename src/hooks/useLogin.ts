import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { signInWithEmail } from "@/services/auth.service";

interface LoginData {
  email: string;
  password: string;
}

export function useLogin() {
  const navigate = useNavigate();

  return useMutation({
    mutationFn: (data: LoginData) => signInWithEmail(data.email, data.password),
    onSuccess: () => {
      navigate({ to: "/dashboard" });
    },
  });
}
