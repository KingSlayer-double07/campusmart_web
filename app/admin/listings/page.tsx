"use client";

import { Suspense } from "react";
import Image from "next/image";
import { CheckCircle2, Flag, FlagOff, PackageSearch, XCircle } from "lucide-react";
import { ToastContainer, useToast } from "@/app/components/Toast";
import { useAdminListings, useModerateListing } from "@/lib/api/hooks/useAdminModeration";
import { REPORT_REASON_LABELS, type AdminListing, type ListingView, type ReportReason } from "@/lib/api/moderation";
import { formatNaira } from "@/lib/labels";
import { dayText } from "@/lib/orderText";
import AdminPageHeader from "../components/AdminPageHeader";
import ConfirmDialog from "../components/ConfirmDialog";
import DataTable, { RowAction, type Column } from "../components/DataTable";
import EmptyState from "../components/EmptyState";
import FilterBar from "../components/FilterBar";
import { useDialog } from "../components/useDialog";
import { useUrlFilters } from "../components/useUrlFilters";
import RejectDialog from "./RejectDialog";

// The review queue is the default tab, so it has no value in the URL
const TABS = [
  { value: "", label: "To review" },
  { value: "HIDDEN", label: "Taken down" },
  { value: "ALL", label: "All listings" },
] as const;

const STATUS_TEXT: Record<AdminListing["status"], string> = {
  DRAFT: "Draft",
  ACTIVE: "Live",
  SOLDOUT: "Sold out",
  ARCHIVED: "Archived",
  FLAGGED: "Hidden",
};

// Why it's in the queue, in the order an admin should read it
function why(l: AdminListing): string[] {
  const lines: string[] = [];
  if (l.reportReasons.includes("PROHIBITED_ITEM")) lines.push("Reported as a prohibited item; hidden until you decide");
  if (l.heldWords.length) lines.push(`Uses: ${l.heldWords.join(", ")}`);
  else if (l.heldAt) lines.push("Edited by the seller after being taken down");
  if (l.openReports) {
    const reasons = l.reportReasons.map((r) => REPORT_REASON_LABELS[r as ReportReason] ?? r).join(", ");
    lines.push(`${l.openReports} open report${l.openReports === 1 ? "" : "s"}: ${reasons}`);
  } else if (l.isFlagged) lines.push("Flagged by an admin");
  if (l.status === "FLAGGED" && !l.isFlagged && !l.heldAt && l.moderationReason) lines.push(`Taken down: ${l.moderationReason}`);
  return lines;
}

const columns: Column<AdminListing>[] = [
  {
    key: "listing",
    header: "Listing",
    cell: (l) => (
      <div className="flex min-w-0 items-center gap-3">
        <div className="relative size-12 shrink-0 overflow-hidden rounded-xl bg-surface-muted">
          {l.imageUrl && <Image src={l.imageUrl} alt="" fill sizes="48px" className="object-cover" />}
        </div>
        <div className="min-w-0 text-xs">
          <p className="truncate text-sm font-semibold text-foreground">{l.title}</p>
          <p className="text-foreground-muted">
            {formatNaira(l.priceKobo)} · {l.storeName}
            {l.sellerSuspended && <span className="font-semibold text-red-600"> · seller suspended</span>}
          </p>
        </div>
      </div>
    ),
  },
  {
    key: "why",
    header: "Why",
    wide: true,
    cell: (l) => {
      const lines = why(l);
      return lines.length ? (
        <ul className="flex flex-col gap-0.5 text-xs text-foreground">
          {lines.map((line) => (
            <li key={line} className="break-words">
              {line}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-foreground-muted">Nothing to review</p>
      );
    },
  },
  {
    key: "status",
    header: "Buyers",
    cell: (l) => (
      <span className={l.status === "FLAGGED" ? "text-xs font-semibold text-red-600" : "text-xs text-foreground"}>
        {STATUS_TEXT[l.status]}
      </span>
    ),
  },
  { key: "added", header: "Added", className: "whitespace-nowrap", hideOnPhone: true, cell: (l) => dayText(l.createdAt) },
];

// Guide 9.1 rule 2 with decisions M2-M4: listings go live at once; banned words, reports and admins
// send them here. Approve puts one live, take down hides it with an M3 reason.
function ListingsScreen() {
  const toast = useToast();
  const [filters, setFilters] = useUrlFilters(["q", "tab"] as const);
  const view: ListingView = filters.tab === "HIDDEN" || filters.tab === "ALL" ? filters.tab : "REVIEW";
  const listings = useAdminListings(view, filters.q || undefined);
  const moderate = useModerateListing();
  const approving = useDialog<AdminListing>();
  const rejecting = useDialog<AdminListing>();
  const flagging = useDialog<AdminListing>();
  const unflagging = useDialog<AdminListing>();

  const inQueue = (l: AdminListing) => l.isFlagged || !!l.heldAt;

  return (
    <>
      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} />
      <div className="flex flex-col gap-6">
        <AdminPageHeader
          title="Listings"
          description="Listings go live at once. Ones using a banned word wait here first, and reported or flagged ones come here too. Every decision is kept in the audit log."
        />
        <FilterBar
          search={filters.q}
          onSearch={(q) => setFilters({ q })}
          searchPlaceholder="Search by title"
          status={filters.tab}
          onStatus={(tab) => setFilters({ tab })}
          statusTabs={TABS}
        />
        <DataTable
          label="Listings"
          columns={columns}
          rows={listings.data?.pages.flatMap((p) => p.items)}
          rowKey={(l) => l.id}
          isLoading={listings.isPending}
          isError={listings.isError}
          onRetry={() => listings.refetch()}
          hasMore={listings.hasNextPage}
          onLoadMore={() => listings.fetchNextPage()}
          isLoadingMore={listings.isFetchingNextPage}
          rowActions={(l) => (
            <>
              {(inQueue(l) || l.status === "FLAGGED") && (
                <RowAction icon={CheckCircle2} onClick={() => approving.show(l)}>
                  Approve
                </RowAction>
              )}
              {!(l.status === "FLAGGED" && !inQueue(l)) && (
                <RowAction icon={XCircle} tone="danger" onClick={() => rejecting.show(l)}>
                  Take down
                </RowAction>
              )}
              {l.status !== "FLAGGED" &&
                (l.isFlagged ? (
                  <RowAction icon={FlagOff} onClick={() => unflagging.show(l)}>
                    Unflag
                  </RowAction>
                ) : (
                  !l.heldAt && (
                    <RowAction icon={Flag} onClick={() => flagging.show(l)}>
                      Flag
                    </RowAction>
                  )
                ))}
            </>
          )}
          empty={
            <EmptyState
              icon={PackageSearch}
              title={filters.q ? "No listings match" : view === "REVIEW" ? "Nothing to review" : view === "HIDDEN" ? "Nothing taken down" : "No listings yet"}
              description={
                view === "REVIEW"
                  ? "Listings held by a banned word, reported or flagged appear here, oldest first."
                  : view === "HIDDEN"
                    ? "Listings you take down appear here until the seller edits them."
                    : "Listings appear here as sellers add them."
              }
            />
          }
        />
      </div>
      <ConfirmDialog
        isOpen={approving.open}
        onClose={approving.close}
        tone="default"
        title="Approve this listing?"
        description={
          approving.target?.status === "FLAGGED"
            ? `"${approving.target.title}" goes live for buyers and its open reports are closed. The seller is told.`
            : `"${approving.target?.title}" stays live and leaves the review queue. Its open reports are closed.`
        }
        confirmLabel="Approve"
        onConfirm={async () => {
          await moderate.mutateAsync({ id: approving.target!.id, type: "APPROVE" });
          toast.success("Listing approved");
        }}
      />
      <RejectDialog
        listing={rejecting.target}
        isOpen={rejecting.open}
        onClose={rejecting.close}
        onRejected={(l, suspended) =>
          toast.success("Listing taken down", suspended ? `${l.storeName} was suspended` : "The seller can see why")
        }
      />
      <ConfirmDialog
        isOpen={flagging.open}
        onClose={flagging.close}
        tone="default"
        title="Flag for review?"
        description="It stays live and joins the review queue so another admin can look at it."
        confirmLabel="Flag"
        requireReason
        reasonLabel="What to check"
        reasonPlaceholder="For example: the price looks too low for a new phone"
        onConfirm={async (note) => {
          await moderate.mutateAsync({ id: flagging.target!.id, type: "FLAG", note });
          toast.success("Flagged for review");
        }}
      />
      <ConfirmDialog
        isOpen={unflagging.open}
        onClose={unflagging.close}
        tone="default"
        title="Unflag this listing?"
        description="It leaves the review queue and its open reports are closed. It stays live."
        confirmLabel="Unflag"
        onConfirm={async () => {
          await moderate.mutateAsync({ id: unflagging.target!.id, type: "UNFLAG" });
          toast.success("Unflagged");
        }}
      />
    </>
  );
}

export default function AdminListingsPage() {
  return (
    <Suspense fallback={null}>
      <ListingsScreen />
    </Suspense>
  );
}
