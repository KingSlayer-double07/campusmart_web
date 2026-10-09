"use client";

import { Suspense, useCallback } from "react";
import Link from "next/link";
import { Pencil, Plus, Power, School } from "lucide-react";
import Button from "@/app/components/Button";
import { ToastContainer, useToast } from "@/app/components/Toast";
import type { AdminInstitution, ActiveFilter } from "@/lib/api/admin";
import { useAdminInstitutions, useUpdateInstitution } from "@/lib/api/hooks/useAdminInstitutions";
import AdminPageHeader from "../components/AdminPageHeader";
import ConfirmDialog from "../components/ConfirmDialog";
import DataTable, { RowAction, type Column } from "../components/DataTable";
import EmptyState from "../components/EmptyState";
import FilterBar from "../components/FilterBar";
import StatusBadge from "../components/StatusBadge";
import { useDialog } from "../components/useDialog";
import { useUrlFilters } from "../components/useUrlFilters";
import InstitutionForm from "./InstitutionForm";

const added = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" });
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const columns: Column<AdminInstitution>[] = [
  {
    key: "name",
    header: "Institution",
    cell: (i) => (
      <div className="min-w-0">
        <p className="font-semibold text-foreground">{i.name}</p>
        <p className="mt-0.5 text-xs text-foreground-muted">Added {added.format(new Date(i.createdAt))}</p>
        <div className="mt-2 md:hidden">
          <StatusBadge active={i.isActive} />
        </div>
      </div>
    ),
  },
  {
    key: "domains",
    header: "Email domains",
    wide: true,
    cell: (i) => (
      <ul className="flex flex-wrap gap-1.5">
        {i.domains.map((d) => (
          <li key={d} className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-medium text-foreground">
            {d}
          </li>
        ))}
      </ul>
    ),
  },
  {
    key: "stations",
    header: "Pickup stations",
    className: "whitespace-nowrap",
    cell: (i) => (
      <Link href={`/admin/stations?institutionId=${i.id}`} className="font-semibold text-main hover:underline">
        {plural(i.stationCount, "station")}
      </Link>
    ),
  },
  {
    key: "users",
    header: "Accounts",
    className: "whitespace-nowrap",
    cell: (i) => <span>{plural(i.userCount, "account")}</span>,
  },
  {
    key: "status",
    header: "Status",
    hideOnPhone: true,
    cell: (i) => <StatusBadge active={i.isActive} />,
  },
];

function InstitutionsScreen() {
  const toast = useToast();
  const [filters, setFilters] = useUrlFilters(["q", "status"] as const);
  const status = (filters.status || undefined) as ActiveFilter | undefined;
  const query = useAdminInstitutions({ q: filters.q || undefined, status });
  const update = useUpdateInstitution();
  const form = useDialog<AdminInstitution>();
  const toggle = useDialog<AdminInstitution>();

  const rows = query.data?.pages.flatMap((p) => p.items);
  const filtered = !!(filters.q || filters.status);
  const onSearch = useCallback((q: string) => setFilters({ q }), [setFilters]);

  const toggling = toggle.target;
  const switchingOff = !!toggling?.isActive;

  return (
    <>
      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} />

      <div className="flex flex-col gap-6">
        <AdminPageHeader
          title="Institutions"
          description="The schools on CampusMart. Students sign up with a school email on one of each school's domains."
          action={
            <Button onClick={() => form.show()} className="sm:w-auto">
              <Plus size={18} className="mr-1.5" />
              Add institution
            </Button>
          }
        />

        <FilterBar
          search={filters.q}
          onSearch={onSearch}
          searchPlaceholder="Search by name or exact domain"
          status={filters.status}
          onStatus={(value) => setFilters({ status: value })}
        />

        <DataTable
          label="Institutions"
          columns={columns}
          rows={rows}
          rowKey={(i) => i.id}
          isLoading={query.isPending}
          isError={query.isError}
          onRetry={() => query.refetch()}
          hasMore={query.hasNextPage}
          onLoadMore={() => query.fetchNextPage()}
          isLoadingMore={query.isFetchingNextPage}
          rowActions={(i) => (
            <>
              <RowAction icon={Pencil} onClick={() => form.show(i)}>
                Edit
              </RowAction>
              <RowAction
                icon={Power}
                tone={i.isActive ? "danger" : "default"}
                onClick={() => toggle.show(i)}
              >
                {i.isActive ? "Switch off" : "Switch on"}
              </RowAction>
            </>
          )}
          empty={
            filtered ? (
              <EmptyState
                icon={School}
                title="No institutions match"
                description="Try another name, or search for a whole domain such as unilag.edu.ng."
                action={
                  <button
                    type="button"
                    onClick={() => setFilters({ q: null, status: null })}
                    className="text-sm font-semibold text-main"
                  >
                    Clear filters
                  </button>
                }
              />
            ) : (
              <EmptyState
                icon={School}
                title="No institutions yet"
                description="Add your first school and its email domains so its students can sign up."
                action={
                  <Button
                    size="sm"
                    className="w-auto"
                    onClick={() => form.show()}
                  >
                    Add institution
                  </Button>
                }
              />
            )
          }
        />
      </div>

      <InstitutionForm
        isOpen={form.open}
        institution={form.target}
        onClose={form.close}
        onSaved={(saved, mode) =>
          toast.success(
            mode === "created" ? "Institution added" : "Changes saved",
            mode === "created" ? `Students at ${saved.name} can now sign up.` : saved.name,
          )
        }
      />

      <ConfirmDialog
        isOpen={toggle.open}
        onClose={toggle.close}
        tone={switchingOff ? "danger" : "default"}
        title={switchingOff ? "Switch off institution?" : "Switch institution back on?"}
        confirmLabel={switchingOff ? "Switch off" : "Switch on"}
        description={
          toggling &&
          (switchingOff ? (
            <div className="flex flex-col gap-2">
              <p>
                <strong className="text-foreground">{toggling.name}</strong> will be paused:
              </p>
              <ul className="list-disc space-y-1 pl-5">
                <li>New students can&apos;t sign up with its email domains.</li>
                <li>It disappears from the public list of schools.</li>
                <li>
                  Buyers, sellers and pickup agents there can&apos;t sign in, and anyone signed in is signed out within 15
                  minutes.
                </li>
                <li>Admins keep access. You can switch it back on at any time.</li>
              </ul>
            </div>
          ) : (
            <p>
              Students at <strong className="text-foreground">{toggling.name}</strong> will be able to sign up and sign
              in again.
            </p>
          ))
        }
        onConfirm={async (reason) => {
          if (!toggling) return;
          const saved = await update.mutateAsync({
            id: toggling.id,
            body: { isActive: !toggling.isActive, ...(reason && { reason }) },
          });
          toast.success(saved.isActive ? "Switched on" : "Switched off", saved.name);
        }}
      />
    </>
  );
}

export default function AdminInstitutionsPage() {
  return (
    <Suspense fallback={null}>
      <InstitutionsScreen />
    </Suspense>
  );
}
