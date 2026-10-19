"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/app/store/useAuthStore";
import { needsSchool } from "@/lib/auth/redirects";

// Pages a buyer without a school can still open: onboarding, the waitlist, their profile and help
const OPEN = ["/onboarding", "/waitlist", "/profile", "/splash", "/~offline"];

// Decision T1: a confirmed buyer who signed up without a school email picks one before shopping
export default function SchoolGate() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const blocked = !!user?.emailVerifiedAt && needsSchool(user) && !OPEN.some((p) => pathname.startsWith(p));

  useEffect(() => {
    if (blocked) router.replace("/onboarding/school");
  }, [blocked, router]);

  return null;
}
