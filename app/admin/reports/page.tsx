"use client";

import { Suspense } from "react";
import Link from "next/link";
import { CheckCircle2, Flag, RotateCcw } from "lucide-react";
import { ToastContainer, useToast } from "@/app/components/Toast";
import { useAdminReports, useUpdateReport } from "@/lib/api/hooks/useAdminModeration";
import { REPORT_REASON_LABELS, type AdminReport, type ReportReason } from "@/lib/api/moderation";
import { whenText } from "@/lib/orderText";
import AdminPageHeader from "../components/AdminPageHeader";
import ConfirmDialog from "../components/ConfirmDialog";
import DataTable, { RowAction, type Column } from "../components/DataTable";
import EmptyState from "../components/EmptyState";
import Tabs from "../components/Tabs";
import { useDialog } from "../components/useDialog";
import { useUrlFilters } from "../components/useUrlFilters";

// Open reports are the default tab, so they have no value in the URL
const TABS = [
  { value: "", label: "Open" },
  { value: "CLOSED", label: "Closed" },
] as const;

const TYPE_LABELS: Record<AdminReport["type"], string> = {
  LISTING: "Listing",
  BUG: "Bug",
  ORDER: "Order",
  PAYMENT: "Payment",
  OTHER: "Other",
};

const columns: Column<AdminReport>[] = [
  {
    key: "report",
    header: "Report",
    wide: true,
    cell: (r) => (
      <div className="min-w-0 text-xs">
        <p className="text-sm font-semibold text-foreground">
          {r.reason ? (REPORT_REASON_LABELS[r.reason as ReportReason] ?? r.reason) : TYPE_LABELS[r.type]}
        </p>
        <p className="mt-0.5 break-words text-foreground">{r.message}</p>
        {r.resolutionNote && <p className="mt-1 break-words text-foreground-muted">Closed: {r.resolutionNote}</p>}
      </div>
    ),
  },
  {
    key: "about",
    header: "About",
    cell: (r) =>
      r.listingId ? (
        <Link href={`/admin/listings?tab=ALL&q=${encodeURIComponent(r.listingTitle ?? "")}`} className="text-xs font-semibold text-main hover:underline">
          {r.listingTitle ?? "A listing"}
        </Link>
      ) : (
        <span className="text-xs">{TYPE_LABELS[r.type]}</span>
      ),
  },
  { key: "from", header: "From", hideOnPhone: true, cell: (r) => <span className="break-all text-xs">{r.reporterEmail}</span> },
  { key: "when", header: "Sent", className: "whitespace-nowrap", hideOnPhone: true, cell: (r) => whenText(r.createdAt) },
];

// Guide 9.1: reports from users. Listing reports also close when an admin decides on the listing.
function ReportsScreen() {
  const toast = useToast();
  const [filters, setFilters] = useUrlFilters(["tab"] as const);
  const status = filters.tab === "CLOSED" ? "CLOSED" : "OPEN";
  const reports = useAdminReports(status);
  const update = useUpdateReport();
  const closing = useDialog<AdminReport>();
  const reopening = useDialog<AdminReport>();

  return (
    <>
      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} />
      <div className="flex flex-col gap-6">
        <AdminPageHeader
          title="Reports"
          description="What users report, oldest first. Five reports on a listing send it to the review queue, and a prohibited-item report hides it at once. Deciding on the listing closes its reports."
        />
        <Tabs tabs={TABS} value={filters.tab === "CLOSED" ? "CLOSED" : ""} onChange={(tab) => setFilters({ tab })} />
        <DataTable
          label="Reports"
          columns={columns}
          rows={reports.data?.pages.flatMap((p) => p.items)}
          rowKey={(r) => r.id}
          isLoading={reports.isPending}
          isError={reports.isError}
          onRetry={() => reports.refetch()}
          hasMore={reports.hasNextPage}
          onLoadMore={() => reports.fetchNextPage()}
          isLoadingMore={reports.isFetchingNextPage}
          rowActions={(r) =>
            r.status === "OPEN" ? (
              <RowAction icon={CheckCircle2} onClick={() => closing.show(r)}>
                Close
              </RowAction>
            ) : (
              <RowAction icon={RotateCcw} onClick={() => reopening.show(r)}>
                Reopen
              </RowAction>
            )
          }
          empty={
            <EmptyState
              icon={Flag}
              title={status === "OPEN" ? "No open reports" : "No closed reports"}
              description={status === "OPEN" ? "Reports from users appear here." : "Reports you or the moderation queue close appear here."}
            />
          }
        />
      </div>
      <ConfirmDialog
        isOpen={closing.open}
        onClose={closing.close}
        tone="default"
        title="Close this report?"
        description="Say what was done. It's kept with the report and in the audit log."
        confirmLabel="Close report"
        requireReason
        reasonLabel="What was done"
        reasonPlaceholder="For example: checked the listing, the photos match the item"
        onConfirm={async (note) => {
          await update.mutateAsync({ id: closing.target!.id, status: "CLOSED", note });
          toast.success("Report closed");
        }}
      />
      <ConfirmDialog
        isOpen={reopening.open}
        onClose={reopening.close}
        tone="default"
        title="Reopen this report?"
        description="It goes back to the open list. A listing report counts towards the listing's reports again."
        confirmLabel="Reopen"
        onConfirm={async () => {
          await update.mutateAsync({ id: reopening.target!.id, status: "OPEN" });
          toast.success("Report reopened");
        }}
      />
    </>
  );
}

export default function AdminReportsPage() {
  return (
    <Suspense fallback={null}>
      <ReportsScreen />
    </Suspense>
  );
}
