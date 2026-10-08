"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/app/store/useAuthStore";
import { homeForRole } from "@/lib/auth/redirects";

export default function SplashScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (user) {
        router.replace(user.emailVerifiedAt ? homeForRole(user.role) : "/onboarding/verify-email");
      } else {
        router.replace("/onboarding/role-select");
      }
    }, 2200);
    return () => clearTimeout(timer);
  }, [user, router]);

  return (
    <>
      <main className="flex flex-col items-center justify-center min-h-dvh px-6">
        {/* Logo mark */}
        <div className="flex flex-col items-center gap-3 animate-[fadeUp_0.6s_ease_forwards]">
          {/* 2×2 icon grid — mirrors the design */}
          <div className="grid grid-cols-2 gap-[6px]">
            <div className="w-9 h-9 rounded-full bg-main" />
            <div className="w-9 h-9 rounded-full bg-main" />
            <div className="w-9 h-9 rounded-[10px] bg-main" />
            <div className="w-9 h-9 rounded-[10px] bg-main" />
          </div>

          {/* Wordmark */}
          <p className="text-main text-[38px] font-bold tracking-tighter leading-none">
            CampusMart
          </p>

          {/* Tagline */}
          <p className="text-main/70 text-[15px] font-medium tracking-tight">
            Browse. Buy. Sell Items
          </p>
        </div>

        {/* Bottom tagline */}
        <p className="absolute bottom-10 text-foreground-muted text-[13px] font-medium text-center leading-relaxed">
          The marketplace
          <br />
          for everyone, by students.
        </p>
      </main>
    </>
  );
}
