"use client";

import { Suspense } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Eye, MessageSquareWarning, Scale } from "lucide-react";
import { ToastContainer, useToast } from "@/app/components/Toast";
import type { AdminDispute, AdminProblem } from "@/lib/api/dispatch";
import { useAdminDisputes, useAdminProblems, useCloseProblem } from "@/lib/api/hooks/useAdminDispatch";
import { formatNaira } from "@/lib/labels";
import { whenText } from "@/lib/orderText";
import AdminPageHeader from "../components/AdminPageHeader";
import ConfirmDialog from "../components/ConfirmDialog";
import DataTable, { RowAction, type Column } from "../components/DataTable";
import EmptyState from "../components/EmptyState";
import Tabs from "../components/Tabs";
import { useDialog } from "../components/useDialog";
import { useUrlFilters } from "../components/useUrlFilters";
import { reasonLabel } from "./labels";

// Open disputes are the default tab, so it has no value in the URL
const TABS = [
  { value: "", label: "Open disputes" },
  { value: "RESOLVED", label: "Decided" },
  { value: "PROBLEMS", label: "Reported problems" },
  { value: "CLOSED", label: "Closed problems" },
] as const;

const disputeColumns: Column<AdminDispute>[] = [
  {
    key: "order",
    header: "Order",
    cell: (d) => (
      <div>
        <p className="font-mono font-semibold">{d.code}</p>
        <p className="text-xs text-foreground-muted">
          {d.storeName} · {formatNaira(d.subtotalKobo)}
        </p>
      </div>
    ),
  },
  { key: "buyer", header: "Buyer", hideOnPhone: true, cell: (d) => d.buyerName },
  { key: "reason", header: "Reason", cell: (d) => reasonLabel(d.reason) },
  {
    key: "when",
    header: "Opened",
    className: "whitespace-nowrap",
    hideOnPhone: true,
    cell: (d) => whenText(d.createdAt),
  },
];

const problemColumns: Column<AdminProblem>[] = [
  {
    key: "order",
    header: "Order",
    cell: (p) => (
      <div>
        <p className="font-mono font-semibold">{p.code ?? "Whole delivery"}</p>
        {p.storeName && <p className="text-xs text-foreground-muted">{p.storeName}</p>}
      </div>
    ),
  },
  {
    key: "from",
    header: "From",
    cell: (p) => (
      <div className="text-xs">
        <p className="font-semibold">{p.reporterName}</p>
        <p className="text-foreground-muted">{p.reporterRole === "DISPATCH" ? "Rider" : "Buyer"}</p>
      </div>
    ),
  },
  {
    key: "what",
    header: "What",
    wide: true,
    cell: (p) => (
      <div className="min-w-0 text-xs">
        <p className="font-semibold">{reasonLabel(p.reason)}</p>
        {p.details && <p className="break-words text-foreground-muted">{p.details}</p>}
        <p className="mt-1 text-foreground-muted">Now: {p.storeStates.join(", ")}</p>
        {p.resolutionNote && <p className="mt-1">Closed: {p.resolutionNote}</p>}
      </div>
    ),
  },
  { key: "when", header: "Reported", className: "whitespace-nowrap", hideOnPhone: true, cell: (p) => whenText(p.createdAt) },
];

// Guide 9.1 Disputes, built with Phase 6: disputes hold the payout until decided (F8); problems
// reported before handover alert you so you can act (C8, DL8)
function DisputesScreen() {
  const router = useRouter();
  const toast = useToast();
  const [filters, setFilters] = useUrlFilters(["tab"] as const);
  const tab = TABS.some((t) => t.value === filters.tab) ? filters.tab : "";
  const problemsTab = tab === "PROBLEMS" || tab === "CLOSED";
  const disputes = useAdminDisputes(tab === "RESOLVED" ? "RESOLVED" : "OPEN");
  const problems = useAdminProblems(tab === "CLOSED" ? "CLOSED" : "OPEN", problemsTab);
  const closeProblem = useCloseProblem();
  const closing = useDialog<AdminProblem>();

  return (
    <>
      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} />
      <div className="flex flex-col gap-6">
        <AdminPageHeader
          title="Disputes and problems"
          description="A buyer can report a problem from payment until 48 hours after handover. Before handover it comes here as a problem for you to act on; after, it's a dispute that holds the seller's payout until you decide."
        />
        <Tabs tabs={TABS} value={tab} onChange={(value) => setFilters({ tab: value })} />
        {problemsTab ? (
          <DataTable
            label="Reported problems"
            columns={problemColumns}
            rows={problems.data?.pages.flatMap((p) => p.items)}
            rowKey={(p) => p.id}
            isLoading={problems.isPending}
            isError={problems.isError}
            onRetry={() => problems.refetch()}
            hasMore={problems.hasNextPage}
            onLoadMore={() => problems.fetchNextPage()}
            isLoadingMore={problems.isFetchingNextPage}
            rowActions={(p) =>
              p.status === "OPEN" ? (
                <RowAction icon={CheckCircle2} onClick={() => closing.show(p)}>
                  Close
                </RowAction>
              ) : null
            }
            empty={<EmptyState icon={MessageSquareWarning} title="No problems here" description="Late or lost orders reported by buyers, and no-shows reported by riders, appear here." />}
          />
        ) : (
          <DataTable
            label="Disputes"
            columns={disputeColumns}
            rows={disputes.data?.pages.flatMap((p) => p.items)}
            rowKey={(d) => d.id}
            isLoading={disputes.isPending}
            isError={disputes.isError}
            onRetry={() => disputes.refetch()}
            hasMore={disputes.hasNextPage}
            onLoadMore={() => disputes.fetchNextPage()}
            isLoadingMore={disputes.isFetchingNextPage}
            rowActions={(d) => (
              <RowAction icon={Eye} onClick={() => router.push(`/admin/disputes/${d.id}`)}>
                {d.status === "OPEN" ? "Decide" : "View"}
              </RowAction>
            )}
            empty={<EmptyState icon={Scale} title={tab === "RESOLVED" ? "Nothing decided yet" : "No open disputes"} description="Disputes buyers open after handover appear here." />}
          />
        )}
      </div>
      <ConfirmDialog
        isOpen={closing.open}
        onClose={closing.close}
        tone="default"
        requireReason
        title="Close this problem?"
        description="Say what was done; it's kept with the report."
        confirmLabel="Close"
        reasonPlaceholder="For example: assigned another rider, delivered next morning"
        onConfirm={async (note) => {
          await closeProblem.mutateAsync({ id: closing.target!.id, note: note! });
          toast.success("Problem closed");
        }}
      />
    </>
  );
}

export default function AdminDisputesPage() {
  return (
    <Suspense fallback={null}>
      <DisputesScreen />
    </Suspense>
  );
}
