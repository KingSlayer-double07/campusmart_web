"use client";

import { useState } from "react";
import Link from "next/link";
import { Bike, Pencil, School } from "lucide-react";
import { ToastContainer, useToast } from "@/app/components/Toast";
import type { AdminInstitution } from "@/lib/api/admin";
import { useAdminInstitutions } from "@/lib/api/hooks/useAdminInstitutions";
import { formatNaira } from "@/lib/labels";
import AdminPageHeader from "../components/AdminPageHeader";
import DataTable, { RowAction, type Column } from "../components/DataTable";
import EmptyState from "../components/EmptyState";
import DeliveryFeeDialog from "./DeliveryFeeDialog";

const columns: Column<AdminInstitution>[] = [
  {
    key: "name",
    header: "Institution",
    cell: (i) => (
      <div className="min-w-0">
        <p className="font-semibold text-foreground">{i.name}</p>
        {!i.isActive && <p className="mt-0.5 text-xs font-medium text-main">Switched off</p>}
      </div>
    ),
  },
  {
    key: "fee",
    header: "Delivery fee on campus",
    cell: (i) =>
      i.deliveryFeeKobo === null ? (
        <span className="text-foreground-muted">Not set: no delivery on campus yet</span>
      ) : (
        <span className="font-semibold">{formatNaira(i.deliveryFeeKobo)} per order</span>
      ),
  },
  {
    key: "places",
    header: "Campus places",
    className: "whitespace-nowrap",
    cell: (i) => (
      <Link href={`/admin/places?institutionId=${i.id}`} className="font-semibold text-main hover:underline">
        {i.placeCount === 0 ? "Add places" : i.placeCount}
      </Link>
    ),
  },
];

// Platform settings an admin can change (decision R1a). Phase 4b starts it with each campus's
// delivery fee; the platform fee, deadlines and other settings join in later phases.
export default function AdminSettingsPage() {
  const toast = useToast();
  const institutions = useAdminInstitutions({ limit: 100 });
  const [editing, setEditing] = useState<AdminInstitution | null>(null);
  const rows = institutions.data?.pages.flatMap((p) => p.items);

  return (
    <>
      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} />
      <div className="flex flex-col gap-6">
        <AdminPageHeader title="Settings" description="Fees and rules that apply across CampusMart." />

        <section aria-labelledby="fees-heading" className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Bike size={18} className="text-main" />
            <h2 id="fees-heading" className="text-base font-semibold text-foreground">
              Delivery fees by campus
            </h2>
          </div>
          <p className="text-sm text-foreground-muted">
            One flat fee per order for a rider to a campus place. Until a school has a fee, its buyers can only get delivery
            off campus, or pick up from the seller.
          </p>
          <DataTable
            label="Delivery fees by campus"
            columns={columns}
            rows={rows}
            rowKey={(i) => i.id}
            isLoading={institutions.isPending}
            isError={institutions.isError}
            onRetry={() => institutions.refetch()}
            hasMore={institutions.hasNextPage}
            onLoadMore={() => institutions.fetchNextPage()}
            isLoadingMore={institutions.isFetchingNextPage}
            rowActions={(i) => (
              <RowAction icon={Pencil} onClick={() => setEditing(i)}>
                {i.deliveryFeeKobo === null ? "Set fee" : "Change fee"}
              </RowAction>
            )}
            empty={
              <EmptyState
                icon={School}
                title="No institutions yet"
                description="Add a school first; then set its delivery fee here."
                action={
                  <Link href="/admin/institutions" className="text-sm font-semibold text-main">
                    Go to institutions
                  </Link>
                }
              />
            }
          />
        </section>
      </div>

      <DeliveryFeeDialog
        institution={editing}
        onClose={() => setEditing(null)}
        onSaved={(saved) =>
          toast.success(
            "Delivery fee saved",
            saved.deliveryFeeKobo === null ? `${saved.name}: no delivery on campus` : `${saved.name}: ${formatNaira(saved.deliveryFeeKobo)} per order`,
          )
        }
      />
    </>
  );
}
