"use client";

import { Suspense } from "react";
import { Eye, EyeOff, Star } from "lucide-react";
import { Stars } from "@/app/components/ReviewList";
import { ToastContainer, useToast } from "@/app/components/Toast";
import type { AdminReview } from "@/lib/api/reviews";
import { useAdminReviews, useSetReviewHidden } from "@/lib/api/hooks/useAdminReviews";
import { whenText } from "@/lib/orderText";
import AdminPageHeader from "../components/AdminPageHeader";
import ConfirmDialog from "../components/ConfirmDialog";
import DataTable, { RowAction, type Column } from "../components/DataTable";
import EmptyState from "../components/EmptyState";
import Tabs from "../components/Tabs";
import { useDialog } from "../components/useDialog";
import { useUrlFilters } from "../components/useUrlFilters";

// Shown reviews are the default tab, so it has no value in the URL
const TABS = [
  { value: "", label: "Shown" },
  { value: "HIDDEN", label: "Hidden" },
] as const;

const columns: Column<AdminReview>[] = [
  {
    key: "review",
    header: "Review",
    wide: true,
    cell: (r) => (
      <div className="min-w-0 text-xs">
        <Stars rating={r.rating} size={12} />
        {r.comment ? <p className="mt-1 break-words text-sm text-foreground">{r.comment}</p> : <p className="mt-1 text-foreground-muted">No comment</p>}
        {r.hiddenReason && <p className="mt-1 text-red-600">Hidden: {r.hiddenReason}</p>}
      </div>
    ),
  },
  {
    key: "item",
    header: "Item",
    cell: (r) => (
      <div className="text-xs">
        <p className="font-semibold">{r.listingTitle}</p>
        <p className="text-foreground-muted">{r.storeName}</p>
      </div>
    ),
  },
  { key: "by", header: "By", hideOnPhone: true, cell: (r) => r.reviewerDisplayName },
  { key: "when", header: "Written", className: "whitespace-nowrap", hideOnPhone: true, cell: (r) => whenText(r.createdAt) },
];

// Decision R4: no edits or seller replies; an admin hides an abusive review with a reason, and it
// stops counting towards the item's and the store's ratings
function ReviewsScreen() {
  const toast = useToast();
  const [filters, setFilters] = useUrlFilters(["tab"] as const);
  const tab = filters.tab === "HIDDEN" ? "HIDDEN" : "";
  const reviews = useAdminReviews(tab === "HIDDEN" ? "HIDDEN" : "SHOWN");
  const setHidden = useSetReviewHidden();
  const hiding = useDialog<AdminReview>();
  const showing = useDialog<AdminReview>();

  return (
    <>
      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} />
      <div className="flex flex-col gap-6">
        <AdminPageHeader
          title="Reviews"
          description="Buyers rate what they received. Hide a review that's abusive; it stops showing and counting towards ratings. The reason is kept in the audit log."
        />
        <Tabs tabs={TABS} value={tab} onChange={(value) => setFilters({ tab: value })} />
        <DataTable
          label="Reviews"
          columns={columns}
          rows={reviews.data?.pages.flatMap((p) => p.items)}
          rowKey={(r) => r.id}
          isLoading={reviews.isPending}
          isError={reviews.isError}
          onRetry={() => reviews.refetch()}
          hasMore={reviews.hasNextPage}
          onLoadMore={() => reviews.fetchNextPage()}
          isLoadingMore={reviews.isFetchingNextPage}
          rowActions={(r) =>
            r.hiddenAt ? (
              <RowAction icon={Eye} onClick={() => showing.show(r)}>
                Show again
              </RowAction>
            ) : (
              <RowAction icon={EyeOff} onClick={() => hiding.show(r)}>
                Hide
              </RowAction>
            )
          }
          empty={
            <EmptyState
              icon={Star}
              title={tab === "HIDDEN" ? "No hidden reviews" : "No reviews yet"}
              description={tab === "HIDDEN" ? "Reviews you hide appear here." : "Reviews buyers write appear here, newest first."}
            />
          }
        />
      </div>
      <ConfirmDialog
        isOpen={hiding.open}
        onClose={hiding.close}
        tone="danger"
        title="Hide this review?"
        description="It stops showing to buyers and counting towards the ratings."
        confirmLabel="Hide review"
        reasonPlaceholder="For example: insults the seller"
        onConfirm={async (reason) => {
          await setHidden.mutateAsync({ id: hiding.target!.id, reason: reason! });
          toast.success("Review hidden", "The ratings have been recounted");
        }}
      />
      <ConfirmDialog
        isOpen={showing.open}
        onClose={showing.close}
        tone="default"
        title="Show this review again?"
        description="It shows to buyers and counts towards the ratings again."
        confirmLabel="Show review"
        onConfirm={async () => {
          await setHidden.mutateAsync({ id: showing.target!.id, reason: null });
          toast.success("Review shown again");
        }}
      />
    </>
  );
}

export default function AdminReviewsPage() {
  return (
    <Suspense fallback={null}>
      <ReviewsScreen />
    </Suspense>
  );
}
