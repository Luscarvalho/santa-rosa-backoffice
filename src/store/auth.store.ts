import type { User } from "firebase/auth";
import { create } from "zustand";

interface AuthState {
  uid: string | null;
  email: string | null;
  displayName: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (user: User | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  uid: null,
  email: null,
  displayName: null,
  isAuthenticated: false,
  isLoading: true,
  setUser: (user) =>
    set({
      uid: user?.uid ?? null,
      email: user?.email ?? null,
      displayName: user?.displayName ?? null,
      isAuthenticated: !!user,
      isLoading: false,
    }),
}));
