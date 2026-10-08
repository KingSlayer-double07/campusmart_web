import { create } from "zustand";
import { persist } from "zustand/middleware";
import { authApi, type User } from "@/lib/api/auth";

// The httpOnly cookies are the truth (D6). This store only keeps the last known user so the
// first paint is instant; AuthProvider refreshes it from GET /auth/me on every app start.
type AuthStore = {
  user: User | null;
  login: (email: string, password: string) => Promise<User>;
  setUser: (user: User) => void;
  clearAuth: () => void;
};

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,

      login: async (email, password) => {
        const user = await authApi.login({ email, password });
        set({ user });
        return user;
      },

      setUser: (user) => set({ user }),
      clearAuth: () => set({ user: null }),
    }),
    {
      name: "campus-mart-auth",
      partialize: (state) => ({ user: state.user }),
    }
  )
);
