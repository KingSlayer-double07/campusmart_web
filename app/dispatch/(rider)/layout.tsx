"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bike, LogOut } from "lucide-react";
import RoleGate from "@/app/components/RoleGate";
import { useLogout } from "@/lib/api/hooks/useLogout";

// Phase 6: the rider app, a phone layout for the DISPATCH role
export default function RiderLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const logout = useLogout();
  return (
    <RoleGate allow={["DISPATCH"]}>
      <div className="flex min-h-dvh justify-center bg-surface-muted font-dmSans tracking-tight text-foreground">
        <div className="flex w-full max-w-md flex-col">
          <header className="flex items-center justify-between bg-card px-4 py-3">
            <Link href="/dispatch" className="flex items-center gap-2 font-bold">
              <Bike size={20} className="text-main" /> CampusMart Rider
            </Link>
            <button
              type="button"
              onClick={async () => {
                await logout();
                router.replace("/onboarding/buyers/sign-in");
              }}
              className="flex items-center gap-1 text-xs font-semibold text-foreground-muted"
            >
              <LogOut size={14} /> Sign out
            </button>
          </header>
          {children}
        </div>
      </div>
    </RoleGate>
  );
}
