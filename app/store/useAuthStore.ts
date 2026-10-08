import { create } from "zustand";
import { persist } from "zustand/middleware";
import { authApi, User } from "@/lib/api/auth";

type AuthStore = {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: User) => void;
  clearAuth: () => void;
};

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,

      login: async (email, password) => {
        // DEVELOPMENT MOCK: bypass real backend auth
        document.cookie = `auth_token=dev-mock-token; path=/; max-age=${60 * 60 * 24 * 7}`;
        set({ 
          user: { id: "dev123", email: email || "dev@example.com", role: "SELLER" } as any, 
          isAuthenticated: true 
        });
        
        // Uncomment below for production
        // const response = await authApi.login({ email, password });
        // set({ user: response.user, isAuthenticated: true });
      },

      logout: async () => {
        try {
          await authApi.logout();
        } catch (error) {
          console.error("Logout failed:", error);
        } finally {
          document.cookie = "auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
          set({ user: null, isAuthenticated: false });
        }
      },

      setUser: (user: User) => set({ user, isAuthenticated: true }),
      clearAuth: () => {
        document.cookie = "auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
        set({ user: null, isAuthenticated: false });
      },
    }),
    { name: "campus-mart-auth" }
  )
);
