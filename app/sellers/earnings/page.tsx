"use client";

import { Wallet } from "lucide-react";
import PageHeader from "@/app/components/PageHeader";
import { ToastContainer, useToast } from "@/app/components/Toast";
import type { Payout, PayoutStatus } from "@/lib/api/payments";
import { usePayoutAccount, useSellerPayouts } from "@/lib/api/hooks/usePayouts";
import { PAYOUT_STATUS_LABELS, formatNaira } from "@/lib/labels";
import PayoutAccountCard from "../components/PayoutAccountCard";

const when = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" });

const STATUS_STYLE: Record<PayoutStatus, string> = {
  PENDING: "bg-blue-50 text-seller-main",
  PROCESSING: "bg-blue-50 text-seller-main",
  PAID: "bg-green-50 text-green-700",
  FAILED: "bg-red-50 text-red-600",
  AWAITING_ACCOUNT: "bg-orange-50 text-main",
};

function PayoutRow({ payout }: { payout: Payout }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-border-default bg-card px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{formatNaira(payout.amountKobo)}</p>
        <p className="text-xs text-foreground-muted">
          Order <span className="font-mono">{payout.sellerOrderCode}</span> · {when.format(new Date(payout.paidAt ?? payout.createdAt))}
        </p>
        {payout.status === "FAILED" && <p className="text-xs text-red-600">CampusMart is looking into it and will send it again.</p>}
      </div>
      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[payout.status]}`}>{PAYOUT_STATUS_LABELS[payout.status]}</span>
    </li>
  );
}

// Guide 5.4: the payout account and every payout with its status. Money for an order is paid out
// 48 hours after the buyer receives it, unless they report a problem (D11).
export default function EarningsPage() {
  const toast = useToast();
  const account = usePayoutAccount();
  const payouts = useSellerPayouts();
  const rows = payouts.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} />
      <main className="flex flex-col gap-6 max-w-md w-full pb-28 px-6 pt-12">
        <PageHeader title="Earnings" showBack={false} />

        {account.isPending ? (
          <div className="h-28 animate-pulse rounded-lg bg-card" aria-busy="true" aria-label="Loading your payout account" />
        ) : account.isError ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-border-default bg-card p-5 text-center">
            <p className="text-sm font-medium">We couldn&apos;t load your payout account</p>
            <button type="button" onClick={() => account.refetch()} className="text-sm font-semibold text-seller-main">
              Try again
            </button>
          </div>
        ) : (
          <PayoutAccountCard
            account={account.data}
            onSaved={(saved) => toast.success("Payout account saved", `Payouts go to ${saved.bankName} ••${saved.accountLast4} from tomorrow`)}
          />
        )}

        <section aria-labelledby="payouts-title" className="flex flex-col gap-3">
          <h2 id="payouts-title" className="text-sm font-medium text-foreground">
            Payouts
          </h2>
          {payouts.isPending ? (
            <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading payouts">
              <div className="h-16 animate-pulse rounded-xl bg-card" />
              <div className="h-16 animate-pulse rounded-xl bg-card" />
            </div>
          ) : payouts.isError ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <p className="text-sm font-medium">We couldn&apos;t load your payouts</p>
              <button type="button" onClick={() => payouts.refetch()} className="text-sm font-semibold text-seller-main">
                Try again
              </button>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-foreground-muted">
              <Wallet size={28} className="text-seller-main" />
              <p className="text-sm font-medium text-foreground">No payouts yet</p>
              <p className="text-xs">Each order is paid out 48 hours after the buyer receives it, as long as there&apos;s no problem reported.</p>
            </div>
          ) : (
            <>
              <ul className="flex flex-col gap-2">
                {rows.map((payout) => (
                  <PayoutRow key={payout.id} payout={payout} />
                ))}
              </ul>
              {payouts.hasNextPage && (
                <button
                  type="button"
                  onClick={() => payouts.fetchNextPage()}
                  disabled={payouts.isFetchingNextPage}
                  className="self-center text-sm font-semibold text-seller-main disabled:opacity-50"
                >
                  {payouts.isFetchingNextPage ? "Loading…" : "Show more"}
                </button>
              )}
            </>
          )}
        </section>
      </main>
    </>
  );
}
