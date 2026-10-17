"use client";

import { Suspense, useCallback } from "react";
import Link from "next/link";
import { MapPin, Pencil, Plus, Power } from "lucide-react";
import Button from "@/app/components/Button";
import { ToastContainer, useToast } from "@/app/components/Toast";
import type { ActiveFilter, AdminCampusPlace } from "@/lib/api/admin";
import { useAdminCampusPlaces, useUpdateCampusPlace } from "@/lib/api/hooks/useAdminCampusPlaces";
import { useAdminInstitutions } from "@/lib/api/hooks/useAdminInstitutions";
import AdminPageHeader from "../components/AdminPageHeader";
import ConfirmDialog from "../components/ConfirmDialog";
import DataTable, { RowAction, type Column } from "../components/DataTable";
import EmptyState from "../components/EmptyState";
import FilterBar from "../components/FilterBar";
import { Select } from "../components/fields";
import StatusBadge from "../components/StatusBadge";
import { useDialog } from "../components/useDialog";
import { useUrlFilters } from "../components/useUrlFilters";
import PlaceForm from "./PlaceForm";

const columns: Column<AdminCampusPlace>[] = [
  {
    key: "name",
    header: "Place",
    cell: (p) => (
      <div className="min-w-0">
        <p className="font-semibold text-foreground">{p.name}</p>
        <div className="mt-2 md:hidden">
          <StatusBadge active={p.isActive} />
        </div>
      </div>
    ),
  },
  {
    key: "institution",
    header: "Institution",
    cell: (p) => (
      <div>
        <p>{p.institution.name}</p>
        {!p.institution.isActive && <p className="mt-0.5 text-xs font-medium text-main">School switched off</p>}
      </div>
    ),
  },
  {
    key: "orders",
    header: "Orders",
    className: "whitespace-nowrap",
    cell: (p) => <span>{p.orderCount === 0 ? "None yet" : p.orderCount}</span>,
  },
  {
    key: "status",
    header: "Status",
    hideOnPhone: true,
    cell: (p) => <StatusBadge active={p.isActive} />,
  },
];

// Decision DF3: the halls, faculties and gates buyers choose for delivery on campus
function PlacesScreen() {
  const toast = useToast();
  const [filters, setFilters] = useUrlFilters(["q", "status", "institutionId"] as const);
  const status = (filters.status || undefined) as ActiveFilter | undefined;
  const places = useAdminCampusPlaces({
    q: filters.q || undefined,
    status,
    institutionId: filters.institutionId || undefined,
  });
  const institutionsQuery = useAdminInstitutions({ limit: 100 });
  const institutions = institutionsQuery.data?.pages.flatMap((p) => p.items) ?? [];
  const update = useUpdateCampusPlace();
  const form = useDialog<AdminCampusPlace>();
  const toggle = useDialog<AdminCampusPlace>();

  const rows = places.data?.pages.flatMap((p) => p.items);
  const filtered = !!(filters.q || filters.status || filters.institutionId);
  const noInstitutions = institutionsQuery.isSuccess && institutions.length === 0;
  const onSearch = useCallback((q: string) => setFilters({ q }), [setFilters]);

  const toggling = toggle.target;
  const switchingOff = !!toggling?.isActive;

  return (
    <>
      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} />

      <div className="flex flex-col gap-6">
        <AdminPageHeader
          title="Campus places"
          description="Where riders deliver on campus. Buyers pick one at checkout; set each school's delivery fee in Settings."
          action={
            <Button onClick={() => form.show()} disabled={noInstitutions} className="sm:w-auto">
              <Plus size={18} className="mr-1.5" />
              Add place
            </Button>
          }
        />

        <FilterBar
          search={filters.q}
          onSearch={onSearch}
          searchPlaceholder="Search by name"
          status={filters.status}
          onStatus={(value) => setFilters({ status: value })}
        >
          <div className="sm:w-64">
            <Select
              aria-label="Institution"
              value={filters.institutionId}
              onChange={(e) => setFilters({ institutionId: e.target.value })}
              className="rounded-full bg-card py-2.5"
            >
              <option value="">All institutions</option>
              {institutions.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </Select>
          </div>
        </FilterBar>

        <DataTable
          label="Campus places"
          columns={columns}
          rows={rows}
          rowKey={(p) => p.id}
          isLoading={places.isPending}
          isError={places.isError}
          onRetry={() => places.refetch()}
          hasMore={places.hasNextPage}
          onLoadMore={() => places.fetchNextPage()}
          isLoadingMore={places.isFetchingNextPage}
          rowActions={(p) => (
            <>
              <RowAction icon={Pencil} onClick={() => form.show(p)}>
                Rename
              </RowAction>
              <RowAction icon={Power} tone={p.isActive ? "danger" : "default"} onClick={() => toggle.show(p)}>
                {p.isActive ? "Switch off" : "Switch on"}
              </RowAction>
            </>
          )}
          empty={
            noInstitutions ? (
              <EmptyState
                icon={MapPin}
                title="Add an institution first"
                description="Every place belongs to a school. Add the school and its email domains, then come back here."
                action={
                  <Link href="/admin/institutions" className="text-sm font-semibold text-main">
                    Go to institutions
                  </Link>
                }
              />
            ) : filtered ? (
              <EmptyState
                icon={MapPin}
                title="No places match"
                description="Try another search, or show every institution."
                action={
                  <button
                    type="button"
                    onClick={() => setFilters({ q: null, status: null, institutionId: null })}
                    className="text-sm font-semibold text-main"
                  >
                    Clear filters
                  </button>
                }
              />
            ) : (
              <EmptyState
                icon={MapPin}
                title="No campus places yet"
                description="Buyers can only get delivery off campus, or pick up, until their school has a place. Add the first one."
                action={
                  <Button size="sm" className="w-auto" onClick={() => form.show()}>
                    Add place
                  </Button>
                }
              />
            )
          }
        />
      </div>

      <PlaceForm
        isOpen={form.open}
        place={form.target}
        institutions={institutions}
        defaultInstitutionId={filters.institutionId || undefined}
        onClose={form.close}
        onSaved={(saved, mode) =>
          toast.success(mode === "created" ? "Place added" : "Changes saved", `${saved.name}, ${saved.institution.name}`)
        }
      />

      <ConfirmDialog
        isOpen={toggle.open}
        onClose={toggle.close}
        tone={switchingOff ? "danger" : "default"}
        title={switchingOff ? "Switch off place?" : "Switch place back on?"}
        confirmLabel={switchingOff ? "Switch off" : "Switch on"}
        reasonPlaceholder="For example: the hall is closed for repairs"
        description={
          toggling &&
          (switchingOff ? (
            <p>
              Buyers won&apos;t be able to choose <strong className="text-foreground">{toggling.name}</strong> for new
              orders. Orders already on their way there aren&apos;t changed.
            </p>
          ) : (
            <p>
              Buyers at {toggling.institution.name} will be able to choose{" "}
              <strong className="text-foreground">{toggling.name}</strong> again.
            </p>
          ))
        }
        onConfirm={async (reason) => {
          if (!toggling) return;
          const saved = await update.mutateAsync({
            id: toggling.id,
            body: { isActive: !toggling.isActive, ...(reason && { reason }) },
          });
          toast.success(saved.isActive ? "Place switched on" : "Place switched off", saved.name);
        }}
      />
    </>
  );
}

export default function AdminPlacesPage() {
  return (
    <Suspense fallback={null}>
      <PlacesScreen />
    </Suspense>
  );
}
