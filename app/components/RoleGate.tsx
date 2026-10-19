"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/app/store/useAuthStore";
import type { UserRole } from "@/lib/api/auth";
import { useMe } from "@/lib/api/hooks/useMe";
import { homeForRole, signInPathFor } from "@/lib/auth/redirects";

// Client-side role check for a section layout (guide 1.6.8). A UX redirect only: the API enforces
// the real rule on every request.
export default function RoleGate({ allow, children }: { allow: UserRole[]; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const storedUser = useAuthStore((s) => s.user);
  const { data: me } = useMe();
  const user = me ?? storedUser;
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const allowKey = allow.join(",");
  const allowed = !!user && allow.includes(user.role);

  useEffect(() => {
    if (!mounted) return;
    if (!user) {
      router.replace(`${signInPathFor(pathname)}?next=${encodeURIComponent(pathname)}`);
    } else if (!allowKey.split(",").includes(user.role)) {
      router.replace(homeForRole(user.role));
    }
  }, [mounted, user, allowKey, pathname, router]);

  if (!mounted || !allowed) return null;
  return <>{children}</>;
}
