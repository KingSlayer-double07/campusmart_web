"use client";

import { Suspense } from "react";
import { RotateCcw, Wallet } from "lucide-react";
import { ToastContainer, useToast } from "@/app/components/Toast";
import type { AdminPayout, PayoutStatus } from "@/lib/api/payments";
import { useAdminPayouts, useRetryPayout } from "@/lib/api/hooks/useAdminPayments";
import { PAYOUT_STATUS_LABELS, formatNaira } from "@/lib/labels";
import AdminPageHeader from "../components/AdminPageHeader";
import ConfirmDialog from "../components/ConfirmDialog";
import DataTable, { RowAction, type Column } from "../components/DataTable";
import EmptyState from "../components/EmptyState";
import Tabs from "../components/Tabs";
import { useDialog } from "../components/useDialog";
import { useUrlFilters } from "../components/useUrlFilters";

const day = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" });

// Failed payouts are the default tab, so it has no value in the URL
const TABS = [
  { value: "", label: "Failed" },
  { value: "AWAITING_ACCOUNT", label: "Waiting for an account" },
  { value: "PROCESSING", label: "Sending" },
  { value: "PAID", label: "Paid" },
  { value: "ALL", label: "All" },
] as const;

const EMPTY: Record<string, { title: string; description: string }> = {
  FAILED: { title: "No failed payouts", description: "When Paystack can't send a payout, it shows here so you can retry it." },
  AWAITING_ACCOUNT: {
    title: "No one is waiting",
    description: "Payouts wait here when the seller hasn't added a payout account. They go out once they do.",
  },
  PROCESSING: { title: "Nothing is being sent", description: "Payouts Paystack is sending right now show here." },
  PAID: { title: "No payouts yet", description: "Paid payouts are listed here." },
  ALL: { title: "No payouts yet", description: "A payout is made 48 hours after a buyer receives their order." },
};

const STATUS_STYLE: Record<PayoutStatus, string> = {
  PENDING: "bg-blue-50 text-blue-700",
  PROCESSING: "bg-blue-50 text-blue-700",
  PAID: "bg-green-100 text-green-700",
  FAILED: "bg-red-50 text-red-600",
  AWAITING_ACCOUNT: "bg-orange-50 text-main",
};

const columns: Column<AdminPayout>[] = [
  {
    key: "store",
    header: "Store",
    cell: (p) => (
      <div className="min-w-0">
        <p className="font-semibold text-foreground break-words">{p.storeName}</p>
        <p className="mt-0.5 font-mono text-xs text-foreground-muted">{p.sellerOrderCode}</p>
      </div>
    ),
  },
  { key: "amount", header: "Amount", className: "whitespace-nowrap", cell: (p) => <span className="font-semibold">{formatNaira(p.amountKobo)}</span> },
  {
    key: "status",
    header: "Status",
    wide: true,
    cell: (p) => (
      <div className="flex flex-col items-start gap-1">
        <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap ${STATUS_STYLE[p.status]}`}>
          {PAYOUT_STATUS_LABELS[p.status]}
        </span>
        {p.failureReason && <p className="text-xs text-foreground-muted break-words">{p.failureReason}</p>}
      </div>
    ),
  },
  { key: "attempts", header: "Tries", hideOnPhone: true, cell: (p) => p.attempt },
  { key: "created", header: "Released", hideOnPhone: true, className: "whitespace-nowrap", cell: (p) => day.format(new Date(p.createdAt)) },
];

// Guide 9.1 Payouts: failed and waiting payouts, with retry (built with Phase 5, decision W1)
function PayoutsScreen() {
  const toast = useToast();
  const [filters, setFilters] = useUrlFilters(["status"] as const);
  const tab = TABS.some((t) => t.value === filters.status) ? filters.status : "";
  const status = tab === "" ? "FAILED" : tab === "ALL" ? undefined : (tab as PayoutStatus);
  const query = useAdminPayouts(status ? { status } : {});
  const retry = useRetryPayout();
  const confirm = useDialog<AdminPayout>();
  const rows = query.data?.pages.flatMap((p) => p.items);
  const empty = EMPTY[status ?? "ALL"];

  return (
    <>
      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} />
      <div className="flex flex-col gap-6">
        <AdminPageHeader
          title="Payouts"
          description="Sellers are paid by Paystack transfer 48 hours after the buyer receives their order. Retry a failed payout once the problem is fixed, for example after the seller corrects their account."
        />

        <Tabs tabs={TABS} value={tab} onChange={(value) => setFilters({ status: value })} />

        <DataTable
          label="Payouts"
          columns={columns}
          rows={rows}
          rowKey={(p) => p.id}
          isLoading={query.isPending}
          isError={query.isError}
          onRetry={() => query.refetch()}
          hasMore={query.hasNextPage}
          onLoadMore={() => query.fetchNextPage()}
          isLoadingMore={query.isFetchingNextPage}
          rowActions={(p) =>
            p.status === "FAILED" ? (
              <RowAction icon={RotateCcw} onClick={() => confirm.show(p)}>
                Retry
              </RowAction>
            ) : null
          }
          empty={<EmptyState icon={Wallet} title={empty.title} description={empty.description} />}
        />
      </div>

      <ConfirmDialog
        isOpen={confirm.open}
        onClose={confirm.close}
        tone="default"
        title="Retry this payout?"
        description={
          confirm.target ? (
            <>
              Paystack will try again to send {formatNaira(confirm.target.amountKobo)} to {confirm.target.storeName} for order{" "}
              {confirm.target.sellerOrderCode}, with a new reference. This is logged with your name.
            </>
          ) : null
        }
        confirmLabel="Retry payout"
        onConfirm={async () => {
          const target = confirm.target!;
          const result = await retry.mutateAsync(target.id);
          // A seller who changed their account in the last 24 hours gets it once the hold ends (P9)
          if (result.status === "FAILED") toast.error("Retried, but it failed again", result.failureReason ?? "Paystack refused it");
          else if (result.status === "PENDING") toast.success("Payout queued", `${formatNaira(result.amountKobo)} to ${result.storeName} goes out on the next run`);
          else toast.success("Payout sent again", `${formatNaira(result.amountKobo)} to ${result.storeName}`);
        }}
      />
    </>
  );
}

export default function AdminPayoutsPage() {
  return (
    <Suspense fallback={null}>
      <PayoutsScreen />
    </Suspense>
  );
}
