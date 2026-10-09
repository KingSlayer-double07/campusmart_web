"use client";

import { useEffect, useRef } from "react";
import { PENDING_STORE_NAME_KEY } from "@/app/onboarding/components/SignUpForm";
import { useSellerProfile, useUpdateSellerProfile } from "@/lib/api/hooks/useSellerProfile";

// The store name typed at sign-up waits in localStorage until the seller is verified and their
// store exists (Phase 1); it's saved here once, unless the store already has a name.
export default function PendingStoreName() {
  const { data: profile } = useSellerProfile();
  const update = useUpdateSellerProfile();
  const tried = useRef(false);

  useEffect(() => {
    if (!profile || tried.current) return;
    let pending: string | null = null;
    try {
      pending = localStorage.getItem(PENDING_STORE_NAME_KEY);
    } catch {
      return;
    }
    if (!pending) return;
    tried.current = true;
    if (profile.storeName) {
      localStorage.removeItem(PENDING_STORE_NAME_KEY);
      return;
    }
    update.mutate(
      { storeName: pending },
      { onSuccess: () => localStorage.removeItem(PENDING_STORE_NAME_KEY) },
    );
  }, [profile, update]);

  return null;
}
