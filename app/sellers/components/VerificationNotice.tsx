"use client";

import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { useSellerProfile } from "@/lib/api/hooks/useSellerProfile";
import { useCanPublish, useIsVerified, useMyVerification } from "@/lib/api/hooks/useSellerVerification";

// Shown on the product screens while the seller can't publish: why products stay drafts, and the
// next step. First an admin verifies the student ID; then the seller adds where riders collect
// from (decision SA1). Both live on the store profile.
export default function VerificationNotice() {
  const canPublish = useCanPublish();
  const verified = useIsVerified();
  const { data } = useMyVerification();
  const { data: profile } = useSellerProfile();
  if (canPublish) return null;

  let copy: { title: string; text: string; link: string | null; href: string };
  if (!verified) {
    if (!data) return null;
    copy =
      data.status === "PENDING"
        ? { title: "We're checking your student ID", text: "Your products stay as drafts until it's approved.", link: null, href: "" }
        : data.status === "REJECTED"
          ? { title: "Your student ID wasn't approved", text: "Your products stay as drafts for now.", link: "See why", href: "/sellers/profile#verification" }
          : {
              title: "Get verified to publish",
              text: "Your products are saved as drafts until an admin checks your student ID.",
              link: "Get verified",
              href: "/sellers/profile#verification",
            };
  } else {
    if (!profile) return null;
    copy = {
      title: "Add your delivery details to publish",
      text: "Riders collect your orders, so they need your area, address and phone number. Your products stay as drafts until then.",
      link: "Add delivery details",
      href: "/sellers/profile#delivery",
    };
  }

  return (
    <div role="status" className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
      <ShieldAlert size={18} className="mt-0.5 shrink-0 text-seller-main" />
      <div className="min-w-0 flex-1 text-xs leading-5">
        <p className="text-sm font-semibold text-foreground">{copy.title}</p>
        <p className="text-foreground-muted">{copy.text}</p>
        {copy.link && (
          <Link href={copy.href} className="font-semibold text-seller-main">
            {copy.link}
          </Link>
        )}
      </div>
    </div>
  );
}
