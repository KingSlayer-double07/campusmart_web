"use client";

import { useState } from "react";
import Link from "next/link";
import { Bike, Percent, Pencil, School, ShieldAlert } from "lucide-react";
import { ToastContainer, useToast } from "@/app/components/Toast";
import type { AdminInstitution } from "@/lib/api/admin";
import { useAdminSettings } from "@/lib/api/hooks/useAdminPayments";
import { useAdminInstitutions } from "@/lib/api/hooks/useAdminInstitutions";
import { useBannedWords } from "@/lib/api/hooks/useAdminModeration";
import { formatNaira } from "@/lib/labels";
import AdminPageHeader from "../components/AdminPageHeader";
import DataTable, { RowAction, type Column } from "../components/DataTable";
import EmptyState from "../components/EmptyState";
import BannedWordsForm from "./BannedWordsForm";
import DeliveryFeeDialog from "./DeliveryFeeDialog";
import PlatformSettingsForm from "./PlatformSettingsForm";

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

// Platform settings an admin can change (decision R1a): the platform fee and seller deadline
// (Phase 5), each campus's delivery fee (Phase 4b) and the banned words (Phase 9).
export default function AdminSettingsPage() {
  const toast = useToast();
  const institutions = useAdminInstitutions({ limit: 100 });
  const settings = useAdminSettings();
  const bannedWords = useBannedWords();
  const [editing, setEditing] = useState<AdminInstitution | null>(null);
  const rows = institutions.data?.pages.flatMap((p) => p.items);

  return (
    <>
      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} />
      <div className="flex flex-col gap-6">
        <AdminPageHeader title="Settings" description="Fees and rules that apply across CampusMart." />

        <section aria-labelledby="platform-heading" className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Percent size={18} className="text-main" />
            <h2 id="platform-heading" className="text-base font-semibold text-foreground">
              Platform fee and deadlines
            </h2>
          </div>
          {settings.isPending ? (
            <div className="h-40 animate-pulse rounded-2xl bg-surface-muted" aria-busy="true" aria-label="Loading settings" />
          ) : settings.isError ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-border-default bg-card p-6 text-center">
              <p className="text-sm font-medium">We couldn&apos;t load the settings</p>
              <button type="button" onClick={() => settings.refetch()} className="text-sm font-semibold text-main">
                Try again
              </button>
            </div>
          ) : (
            <PlatformSettingsForm
              settings={settings.data}
              onSaved={(saved) =>
                toast.success(
                  "Settings saved",
                  `Platform fee ${saved.platformFeeBps / 100}% · ${saved.pickupDeadlineDays} days to hand over · low stock at ${saved.lowStockThreshold}`,
                )
              }
            />
          )}
        </section>

        <section aria-labelledby="banned-heading" className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <ShieldAlert size={18} className="text-main" />
            <h2 id="banned-heading" className="text-base font-semibold text-foreground">
              Banned words
            </h2>
          </div>
          <p className="text-sm text-foreground-muted">
            A listing that uses one of these waits in the review queue instead of going live. The list started from the
            prohibited items; sellers also confirm their item isn&apos;t prohibited before publishing.
          </p>
          {bannedWords.isPending ? (
            <div className="h-56 animate-pulse rounded-2xl bg-surface-muted" aria-busy="true" aria-label="Loading banned words" />
          ) : bannedWords.isError ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-border-default bg-card p-6 text-center">
              <p className="text-sm font-medium">We couldn&apos;t load the banned words</p>
              <button type="button" onClick={() => bannedWords.refetch()} className="text-sm font-semibold text-main">
                Try again
              </button>
            </div>
          ) : (
            <BannedWordsForm
              words={bannedWords.data.words}
              onSaved={(saved, added, removed) =>
                toast.success("Banned words saved", `${saved.length} in the list · ${added} added · ${removed} removed`)
              }
            />
          )}
        </section>

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
