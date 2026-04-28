import type { User } from "firebase/auth";
import { create } from "zustand";

interface AuthState {
  uid: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (user: User | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  uid: null,
  isAuthenticated: false,
  isLoading: true,
  setUser: (user) =>
    set({
      uid: user?.uid ?? null,
      isAuthenticated: !!user,
      isLoading: false,
    }),
}));
