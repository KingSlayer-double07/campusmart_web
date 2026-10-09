"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";

// The app is a phone-width column (max-w-md). The admin console (D16, guide 9.2.1) breaks out of
// it to use the whole screen. Only class names change, never the element tree, so the providers
// inside keep their state when navigating between the two.
export function isWideRoute(pathname: string | null) {
  return pathname === "/admin" || !!pathname?.startsWith("/admin/");
}

export default function AppFrame({ children }: { children: React.ReactNode }) {
  const wide = isWideRoute(usePathname());
  return (
    <div className="flex justify-center min-h-dvh bg-surface-muted">
      <div
        className={cn(
          "w-full min-h-dvh relative overflow-x-hidden",
          wide ? "bg-surface-muted" : "max-w-md bg-card shadow-sm",
        )}
      >
        {children}
      </div>
    </div>
  );
}
