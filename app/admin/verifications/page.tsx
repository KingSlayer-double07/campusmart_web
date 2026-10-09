"use client";

import { Suspense } from "react";
import { Eye, ShieldCheck } from "lucide-react";
import { ToastContainer, useToast } from "@/app/components/Toast";
import type { AdminVerificationRequest, ReviewQueue } from "@/lib/api/admin";
import { useAdminVerifications } from "@/lib/api/hooks/useAdminVerifications";
import AdminPageHeader from "../components/AdminPageHeader";
import DataTable, { RowAction, type Column } from "../components/DataTable";
import EmptyState from "../components/EmptyState";
import Tabs from "../components/Tabs";
import { useDialog } from "../components/useDialog";
import { useUrlFilters } from "../components/useUrlFilters";
import ReviewDialog from "./ReviewDialog";
import { sellerName } from "./sellerName";

const day = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" });

// The waiting queue is the default tab, so it has no value in the URL
const TABS = [
  { value: "", label: "Waiting" },
  { value: "VERIFIED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
] as const;

const EMPTY: Record<ReviewQueue, { title: string; description: string }> = {
  PENDING: {
    title: "No one is waiting",
    description: "Sellers appear here when they send a photo of their student ID.",
  },
  VERIFIED: { title: "No approved sellers yet", description: "Sellers you approve are listed here." },
  REJECTED: { title: "No rejected requests", description: "Requests you reject are listed here with your note." },
};

function columnsFor(queue: ReviewQueue): Column<AdminVerificationRequest>[] {
  return [
    {
      key: "seller",
      header: "Seller",
      cell: (r) => (
        <div className="min-w-0">
          <p className="font-semibold text-foreground">{sellerName(r.seller)}</p>
          <p className="mt-0.5 truncate text-xs text-foreground-muted">{r.seller.email}</p>
          <p className="mt-0.5 text-xs text-foreground-muted md:hidden">
            {[r.seller.storeName, r.seller.institutionName].filter(Boolean).join(" · ")}
          </p>
        </div>
      ),
    },
    {
      key: "store",
      header: "Store",
      hideOnPhone: true,
      cell: (r) => r.seller.storeName ?? <span className="text-foreground-muted">Not named yet</span>,
    },
    {
      key: "school",
      header: "School",
      hideOnPhone: true,
      cell: (r) => r.seller.institutionName ?? <span className="text-foreground-muted">None</span>,
    },
    queue === "PENDING"
      ? {
          key: "sent",
          header: "Sent",
          className: "whitespace-nowrap",
          cell: (r) => day.format(new Date(r.createdAt)),
        }
      : {
          key: "decided",
          header: "Decided",
          className: "whitespace-nowrap",
          cell: (r) => (r.reviewedAt ? day.format(new Date(r.reviewedAt)) : "—"),
        },
    ...(queue === "REJECTED"
      ? [
          {
            key: "note",
            header: "Note to seller",
            wide: true,
            cell: (r: AdminVerificationRequest) => <span className="text-foreground-muted">{r.reviewNote}</span>,
          },
        ]
      : []),
  ];
}

function VerificationsScreen() {
  const toast = useToast();
  const [filters, setFilters] = useUrlFilters(["status"] as const);
  const queue: ReviewQueue = filters.status === "VERIFIED" || filters.status === "REJECTED" ? filters.status : "PENDING";
  const query = useAdminVerifications(queue);
  const review = useDialog<AdminVerificationRequest>();

  const rows = query.data?.pages.flatMap((p) => p.items);
  // Follow the list after a reload, so the dialog gets the fresh 10-minute photo link
  const current = (review.target && rows?.find((r) => r.id === review.target!.id)) ?? review.target;
  const empty = EMPTY[queue];

  return (
    <>
      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} />

      <div className="flex flex-col gap-6">
        <AdminPageHeader
          title="Seller verification"
          description="Sellers send a photo of their student ID. Approve them so their products can go live; if something's wrong, reject with a note telling them what to fix."
        />

        <Tabs tabs={TABS} value={queue === "PENDING" ? "" : queue} onChange={(value) => setFilters({ status: value })} />

        <DataTable
          label="Verification requests"
          columns={columnsFor(queue)}
          rows={rows}
          rowKey={(r) => r.id}
          isLoading={query.isPending}
          isError={query.isError}
          onRetry={() => query.refetch()}
          hasMore={query.hasNextPage}
          onLoadMore={() => query.fetchNextPage()}
          isLoadingMore={query.isFetchingNextPage}
          rowActions={(r) => (
            <RowAction icon={Eye} onClick={() => review.show(r)}>
              {r.status === "PENDING" ? "Review" : "View"}
            </RowAction>
          )}
          empty={<EmptyState icon={ShieldCheck} title={empty.title} description={empty.description} />}
        />
      </div>

      <ReviewDialog
        isOpen={review.open}
        request={current}
        onClose={review.close}
        onReloadPhoto={() => query.refetch()}
        onDecided={(decided) => {
          const name = decided.seller.storeName ?? sellerName(decided.seller);
          if (decided.status === "VERIFIED") toast.success("Seller approved", `${name} can now publish products.`);
          else toast.success("Request rejected", `${name} will see your note.`);
        }}
      />
    </>
  );
}

export default function AdminVerificationsPage() {
  return (
    <Suspense fallback={null}>
      <VerificationsScreen />
    </Suspense>
  );
}
