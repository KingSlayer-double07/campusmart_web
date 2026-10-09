"use client";

import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { useCanPublish, useMyVerification } from "@/lib/api/hooks/useSellerVerification";

// Shown on the product screens until an admin verifies the seller: why products stay drafts,
// and where to get verified (the card on the store profile).
export default function VerificationNotice() {
  const canPublish = useCanPublish();
  const { data } = useMyVerification();
  if (canPublish || !data) return null;

  const copy =
    data.status === "PENDING"
      ? { title: "We're checking your student ID", text: "Your products stay as drafts until it's approved.", link: null }
      : data.status === "REJECTED"
        ? { title: "Your student ID wasn't approved", text: "Your products stay as drafts for now.", link: "See why" }
        : { title: "Get verified to publish", text: "Your products are saved as drafts until an admin checks your student ID.", link: "Get verified" };

  return (
    <div role="status" className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
      <ShieldAlert size={18} className="mt-0.5 shrink-0 text-seller-main" />
      <div className="min-w-0 flex-1 text-xs leading-5">
        <p className="text-sm font-semibold text-foreground">{copy.title}</p>
        <p className="text-foreground-muted">{copy.text}</p>
        {copy.link && (
          <Link href="/sellers/profile#verification" className="font-semibold text-seller-main">
            {copy.link}
          </Link>
        )}
      </div>
    </div>
  );
}
