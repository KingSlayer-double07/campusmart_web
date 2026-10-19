import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/app/store/useAuthStore";
import { useGuestStore } from "@/app/store/useGuestStore";

// Client-side redirect for pages outside the proxy matcher (proxy.ts) (e.g. the home page).
// With `guests`, a visitor browsing a school they picked may stay (decision 2026-10-19).
export function useRequireAuth(redirectTo = "/splash", { guests = false } = {}) {
  const user = useAuthStore((s) => s.user);
  const guestSchool = useGuestStore((s) => s.school);
  const router = useRouter();

  useEffect(() => {
    // Read the stores themselves: while React hydrates a page, zustand's hooks give the stores'
    // initial, empty state, which sent everyone to the splash on a reload of the home page
    const signedIn = !!useAuthStore.getState().user;
    const browsing = guests && !!useGuestStore.getState().school;
    if (!signedIn && !browsing) {
      router.replace(redirectTo);
    }
  }, [user, guests, guestSchool, router, redirectTo]);
}
