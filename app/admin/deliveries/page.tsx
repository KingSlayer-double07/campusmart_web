"use client";

import { Suspense } from "react";
import { AlertTriangle, Lock, Package, Undo2, Unlock, UserCheck } from "lucide-react";
import { ToastContainer, useToast } from "@/app/components/Toast";
import type { AdminDeliveryJob, DeliveryView, LockedHandover } from "@/lib/api/dispatch";
import { useAdminDeliveries, useLockedHandovers, useUnlockHandover } from "@/lib/api/hooks/useAdminDispatch";
import { FULFILLMENT_STATUS_LABELS } from "@/lib/labels";
import { whenText } from "@/lib/orderText";
import AdminPageHeader from "../components/AdminPageHeader";
import ConfirmDialog from "../components/ConfirmDialog";
import DataTable, { RowAction, type Column } from "../components/DataTable";
import EmptyState from "../components/EmptyState";
import Tabs from "../components/Tabs";
import { useDialog } from "../components/useDialog";
import { useUrlFilters } from "../components/useUrlFilters";
import AssignRiderDialog from "./AssignRiderDialog";
import RefundStoreDialog from "./RefundStoreDialog";

// Jobs waiting for a rider are the default tab, so it has no value in the URL
const TABS = [
  { value: "", label: "Waiting for a rider" },
  { value: "ACTIVE", label: "With a rider" },
  { value: "DONE", label: "Done" },
  { value: "LOCKED", label: "Locked codes" },
] as const;

const EMPTY: Record<DeliveryView, { title: string; description: string }> = {
  OPEN: { title: "Every job has a rider", description: "Paid orders going by rider wait here until one accepts. Nobody taking one in 5 hours alerts you." },
  ACTIVE: { title: "No deliveries in progress", description: "Jobs a rider has accepted show here until every store is delivered." },
  DONE: { title: "No finished deliveries yet", description: "Delivered and cancelled jobs show here." },
  ALL: { title: "No deliveries yet", description: "Jobs open when orders going by rider are paid." },
};

const jobColumns: Column<AdminDeliveryJob>[] = [
  {
    key: "order",
    header: "Order",
    cell: (j) => (
      <div className="min-w-0">
        <p className="font-semibold text-foreground">{j.institutionName}</p>
        <p className="text-xs text-foreground-muted">Paid {whenText(j.createdAt)}</p>
        {j.unacceptedAlertAt && j.status === "OPEN" && (
          <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-main">
            <AlertTriangle size={12} /> Waiting over 5 hours
          </p>
        )}
      </div>
    ),
  },
  {
    key: "stores",
    header: "Stores",
    wide: true,
    cell: (j) => (
      <ul className="flex flex-col gap-1">
        {j.stops.map((s) => (
          <li key={s.sellerOrderId} className="text-xs">
            <span className="font-mono font-semibold">{s.code}</span> {s.storeName} ·{" "}
            <span className="text-foreground-muted">{FULFILLMENT_STATUS_LABELS[s.status]}</span>
            {s.notReadyAt && s.status === "RIDER_ASSIGNED" && <span className="text-main"> · not ready</span>}
            {s.handoverLocked && (
              <span className="text-red-500">
                {" "}
                · <Lock size={10} className="inline" /> locked
              </span>
            )}
          </li>
        ))}
      </ul>
    ),
  },
  {
    key: "to",
    header: "Deliver to",
    hideOnPhone: true,
    cell: (j) => (
      <div className="min-w-0 text-xs">
        <p className="break-words">{j.destination}</p>
        <p className="text-foreground-muted">for {j.buyerName}</p>
      </div>
    ),
  },
  {
    key: "rider",
    header: "Rider",
    cell: (j) => (j.rider ? j.rider.name : <span className="text-foreground-muted">No rider yet</span>),
  },
];

const lockedColumns: Column<LockedHandover>[] = [
  {
    key: "code",
    header: "Order",
    cell: (l) => (
      <div>
        <p className="font-mono font-semibold">{l.code}</p>
        <p className="text-xs text-foreground-muted">{l.storeName}</p>
      </div>
    ),
  },
  { key: "buyer", header: "Buyer", cell: (l) => l.buyerName },
  { key: "how", header: "Handover", hideOnPhone: true, cell: (l) => (l.deliveryMethod === "SELLER_PICKUP" ? "At the seller" : "By the rider") },
  { key: "when", header: "Locked", className: "whitespace-nowrap", cell: (l) => whenText(l.lockedAt) },
];

function LockedList({ onUnlocked }: { onUnlocked: (code: string) => void }) {
  const locked = useLockedHandovers();
  const unlock = useUnlockHandover();
  const confirm = useDialog<LockedHandover>();
  return (
    <>
      <DataTable
        label="Locked handovers"
        columns={lockedColumns}
        rows={locked.data?.pages.flatMap((p) => p.items)}
        rowKey={(l) => l.sellerOrderId}
        isLoading={locked.isPending}
        isError={locked.isError}
        onRetry={() => locked.refetch()}
        hasMore={locked.hasNextPage}
        onLoadMore={() => locked.fetchNextPage()}
        isLoadingMore={locked.isFetchingNextPage}
        rowActions={(l) => (
          <RowAction icon={Unlock} onClick={() => confirm.show(l)}>
            Unlock
          </RowAction>
        )}
        empty={<EmptyState icon={Lock} title="Nothing is locked" description="An order locks after 5 wrong handover codes. Check with the buyer, then unlock it here." />}
      />
      <ConfirmDialog
        isOpen={confirm.open}
        onClose={confirm.close}
        tone="default"
        requireReason
        title="Unlock this handover?"
        description={confirm.target ? `The handover code for ${confirm.target.code} can be entered again. Check with ${confirm.target.buyerName} first.` : ""}
        confirmLabel="Unlock"
        reasonPlaceholder="For example: spoke to the buyer, the code was misread"
        onConfirm={async (reason) => {
          await unlock.mutateAsync({ sellerOrderId: confirm.target!.sellerOrderId, reason: reason! });
          onUnlocked(confirm.target!.code);
        }}
      />
    </>
  );
}

// Phase 6: every delivery job, assigning riders (C5), refunds an admin decides (DX6, DL8) and
// handovers locked after wrong codes (F5)
function DeliveriesScreen() {
  const toast = useToast();
  const [filters, setFilters] = useUrlFilters(["view"] as const);
  const tab = TABS.some((t) => t.value === filters.view) ? filters.view : "";
  const view: DeliveryView = tab === "" || tab === "LOCKED" ? "OPEN" : (tab as DeliveryView);
  const jobs = useAdminDeliveries(view);
  const assigning = useDialog<AdminDeliveryJob>();
  const refunding = useDialog<AdminDeliveryJob>();
  const empty = EMPTY[view];

  return (
    <>
      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} />
      <div className="flex flex-col gap-6">
        <AdminPageHeader
          title="Deliveries"
          description="One job per paid order going by rider. Riders at the campus see it and the first to accept takes it. Step in when nobody does, a rider gives a job back, or a parcel goes wrong."
        />
        <Tabs tabs={TABS} value={tab} onChange={(value) => setFilters({ view: value })} />
        {tab === "LOCKED" ? (
          <LockedList onUnlocked={(code) => toast.success("Unlocked", `${code} can be handed over again`)} />
        ) : (
          <DataTable
            label="Delivery jobs"
            columns={jobColumns}
            rows={jobs.data?.pages.flatMap((p) => p.items)}
            rowKey={(j) => j.id}
            isLoading={jobs.isPending}
            isError={jobs.isError}
            onRetry={() => jobs.refetch()}
            hasMore={jobs.hasNextPage}
            onLoadMore={() => jobs.fetchNextPage()}
            isLoadingMore={jobs.isFetchingNextPage}
            rowActions={(j) =>
              j.status === "OPEN" || j.status === "ASSIGNED" ? (
                <>
                  <RowAction icon={UserCheck} onClick={() => assigning.show(j)}>
                    {j.rider ? "Reassign" : "Assign rider"}
                  </RowAction>
                  <RowAction icon={Undo2} tone="danger" onClick={() => refunding.show(j)}>
                    Refund a store
                  </RowAction>
                </>
              ) : null
            }
            empty={<EmptyState icon={Package} title={empty.title} description={empty.description} />}
          />
        )}
      </div>
      <AssignRiderDialog
        job={assigning.open ? assigning.target : null}
        onClose={assigning.close}
        onAssigned={(job) => toast.success("Rider assigned", `${job.rider?.name ?? "The rider"} has the job`)}
      />
      <RefundStoreDialog
        job={refunding.open ? refunding.target : null}
        onClose={refunding.close}
        onRefunded={(code) => toast.success("Refunded", `${code}: the buyer is being refunded`)}
      />
    </>
  );
}

export default function AdminDeliveriesPage() {
  return (
    <Suspense fallback={null}>
      <DeliveriesScreen />
    </Suspense>
  );
}
