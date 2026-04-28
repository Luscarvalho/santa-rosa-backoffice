const firebaseErrorMessages: Record<string, string> = {
  "auth/user-not-found": "Usuário não encontrado",
  "auth/wrong-password": "Senha incorreta",
  "auth/invalid-credential": "Credenciais inválidas",
  "auth/invalid-email": "Email inválido",
  "auth/too-many-requests":
    "Muitas tentativas. Tente novamente em alguns minutos",
  "auth/user-disabled": "Esta conta foi desativada",
  "auth/network-request-failed": "Erro de conexão. Verifique sua internet",
  "auth/email-already-in-use": "Este email já está em uso",
};

export function getFirebaseErrorMessage(error: unknown): string {
  if (error instanceof Error && "code" in error) {
    return (
      firebaseErrorMessages[(error as { code: string }).code] ??
      "Erro inesperado. Tente novamente."
    );
  }
  return "Erro ao fazer login. Tente novamente.";
}
