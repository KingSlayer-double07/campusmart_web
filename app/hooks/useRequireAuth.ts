import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/app/store/useAuthStore";

// Client-side redirect for pages outside the middleware matcher (e.g. the home page)
export function useRequireAuth(redirectTo = "/splash") {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();

  useEffect(() => {
    if (!user) {
      router.replace(redirectTo);
    }
  }, [user, router, redirectTo]);
}
