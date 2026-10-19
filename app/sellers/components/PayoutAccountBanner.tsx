"use client";

import Link from "next/link";
import { Landmark } from "lucide-react";
import { usePaymentConfig } from "@/lib/api/hooks/usePayments";
import { usePayoutAccount } from "@/lib/api/hooks/usePayouts";

// Guide 5.4: the dashboard asks for a payout account until there is one. Hidden while online
// payment is off, since the account can't be checked with a bank then.
export default function PayoutAccountBanner() {
  const payments = usePaymentConfig();
  const account = usePayoutAccount();
  if (!payments.data?.paymentsEnabled || !account.data || account.data.accountLast4) return null;

  return (
    <div role="status" className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
      <Landmark size={18} className="mt-0.5 shrink-0 text-seller-main" />
      <div className="min-w-0 flex-1 text-xs leading-5">
        <p className="text-sm font-semibold text-foreground">Add a payout account</p>
        <p className="text-foreground-muted">Your earnings wait until you tell us where to send them.</p>
        <Link href="/sellers/earnings#payout-account" className="font-semibold text-seller-main">
          Add account
        </Link>
      </div>
    </div>
  );
}
