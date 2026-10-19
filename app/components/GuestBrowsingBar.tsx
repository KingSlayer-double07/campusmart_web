"use client";

import Link from "next/link";
import { School } from "lucide-react";
import { useGuestStore } from "@/app/store/useGuestStore";

// A guest's reminder of the school they're browsing, with a way to change it (decision 2026-10-19)
export default function GuestBrowsingBar() {
  const school = useGuestStore((s) => s.school);
  if (!school) return null;
  return (
    <p className="flex items-center gap-2 text-sm text-foreground-muted">
      <School size={16} className="shrink-0 text-main" aria-hidden />
      <span className="min-w-0 truncate">
        Browsing <strong className="font-semibold text-foreground">{school.name}</strong>
      </span>
      <Link href="/onboarding/guest-school" className="ml-auto shrink-0 font-semibold text-main">
        Change
      </Link>
    </p>
  );
}
