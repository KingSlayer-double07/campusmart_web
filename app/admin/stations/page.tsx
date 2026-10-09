"use client";

import { Suspense, useCallback } from "react";
import Link from "next/link";
import { MapPin, Pencil, Phone, Plus, Power } from "lucide-react";
import Button from "@/app/components/Button";
import { ToastContainer, useToast } from "@/app/components/Toast";
import type { ActiveFilter, AdminPickupStation } from "@/lib/api/admin";
import { useAdminInstitutions } from "@/lib/api/hooks/useAdminInstitutions";
import { useAdminStations, useUpdateStation } from "@/lib/api/hooks/useAdminStations";
import { summarizeOpeningHours } from "@/lib/openingHours";
import AdminPageHeader from "../components/AdminPageHeader";
import ConfirmDialog from "../components/ConfirmDialog";
import DataTable, { RowAction, type Column } from "../components/DataTable";
import EmptyState from "../components/EmptyState";
import FilterBar from "../components/FilterBar";
import { Select } from "../components/fields";
import StatusBadge from "../components/StatusBadge";
import { useDialog } from "../components/useDialog";
import { useUrlFilters } from "../components/useUrlFilters";
import StationForm from "./StationForm";

const columns: Column<AdminPickupStation>[] = [
  {
    key: "name",
    header: "Station",
    cell: (s) => (
      <div className="min-w-0">
        <p className="font-semibold text-foreground">{s.name}</p>
        <p className="mt-0.5 text-xs text-foreground-muted">{s.address}</p>
        <div className="mt-2 md:hidden">
          <StatusBadge active={s.isActive} />
        </div>
      </div>
    ),
  },
  {
    key: "institution",
    header: "Institution",
    cell: (s) => (
      <div>
        <p>{s.institution.name}</p>
        {!s.institution.isActive && <p className="mt-0.5 text-xs font-medium text-main">School switched off</p>}
      </div>
    ),
  },
  {
    key: "contact",
    header: "Contact",
    cell: (s) => (
      <div className="min-w-0">
        <p className="truncate">{s.contactName}</p>
        <a
          href={`tel:${s.contactPhone.replace(/[^\d+]/g, "")}`}
          className="mt-0.5 inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-main hover:underline"
        >
          <Phone size={12} />
          {s.contactPhone}
        </a>
      </div>
    ),
  },
  {
    key: "hours",
    header: "Opening hours",
    wide: true,
    className: "whitespace-nowrap",
    cell: (s) => (
      <ul className="flex flex-col gap-0.5 text-sm">
        {summarizeOpeningHours(s.openingHours).map((line) => (
          <li key={line.days}>
            <span className="inline-block w-20 font-medium">{line.days}</span>
            <span className="text-foreground-muted">{line.hours}</span>
          </li>
        ))}
      </ul>
    ),
  },
  {
    key: "agents",
    header: "Agents",
    className: "whitespace-nowrap",
    cell: (s) => <span>{s.agentCount === 0 ? "None yet" : s.agentCount}</span>,
  },
  {
    key: "status",
    header: "Status",
    hideOnPhone: true,
    cell: (s) => <StatusBadge active={s.isActive} />,
  },
];

function StationsScreen() {
  const toast = useToast();
  const [filters, setFilters] = useUrlFilters(["q", "status", "institutionId"] as const);
  const status = (filters.status || undefined) as ActiveFilter | undefined;
  const stations = useAdminStations({
    q: filters.q || undefined,
    status,
    institutionId: filters.institutionId || undefined,
  });
  const institutionsQuery = useAdminInstitutions({ limit: 100 });
  const institutions = institutionsQuery.data?.pages.flatMap((p) => p.items) ?? [];
  const update = useUpdateStation();
  const form = useDialog<AdminPickupStation>();
  const toggle = useDialog<AdminPickupStation>();

  const rows = stations.data?.pages.flatMap((p) => p.items);
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
          title="Pickup stations"
          description="Where sellers drop off orders and buyers collect them. Each station serves one school."
          action={
            <Button onClick={() => form.show()} disabled={noInstitutions} className="sm:w-auto">
              <Plus size={18} className="mr-1.5" />
              Add station
            </Button>
          }
        />

        <FilterBar
          search={filters.q}
          onSearch={onSearch}
          searchPlaceholder="Search by name or address"
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
          label="Pickup stations"
          columns={columns}
          rows={rows}
          rowKey={(s) => s.id}
          isLoading={stations.isPending}
          isError={stations.isError}
          onRetry={() => stations.refetch()}
          hasMore={stations.hasNextPage}
          onLoadMore={() => stations.fetchNextPage()}
          isLoadingMore={stations.isFetchingNextPage}
          rowActions={(s) => (
            <>
              <RowAction icon={Pencil} onClick={() => form.show(s)}>
                Edit
              </RowAction>
              <RowAction icon={Power} tone={s.isActive ? "danger" : "default"} onClick={() => toggle.show(s)}>
                {s.isActive ? "Switch off" : "Switch on"}
              </RowAction>
            </>
          )}
          empty={
            noInstitutions ? (
              <EmptyState
                icon={MapPin}
                title="Add an institution first"
                description="Every station belongs to a school. Add the school and its email domains, then come back here."
                action={
                  <Link href="/admin/institutions" className="text-sm font-semibold text-main">
                    Go to institutions
                  </Link>
                }
              />
            ) : filtered ? (
              <EmptyState
                icon={MapPin}
                title="No stations match"
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
                title="No pickup stations yet"
                description="Buyers can't check out until their school has a station. Add the first one."
                action={
                  <Button size="sm" className="w-auto" onClick={() => form.show()}>
                    Add station
                  </Button>
                }
              />
            )
          }
        />
      </div>

      <StationForm
        isOpen={form.open}
        station={form.target}
        institutions={institutions}
        defaultInstitutionId={filters.institutionId || undefined}
        onClose={form.close}
        onSaved={(saved, mode) =>
          toast.success(mode === "created" ? "Station added" : "Changes saved", `${saved.name}, ${saved.institution.name}`)
        }
      />

      <ConfirmDialog
        isOpen={toggle.open}
        onClose={toggle.close}
        tone={switchingOff ? "danger" : "default"}
        title={switchingOff ? "Switch off station?" : "Switch station back on?"}
        confirmLabel={switchingOff ? "Switch off" : "Switch on"}
        reasonPlaceholder="For example: the building is closed for repairs"
        description={
          toggling &&
          (switchingOff ? (
            <p>
              Buyers won&apos;t be able to choose <strong className="text-foreground">{toggling.name}</strong> for new
              orders. Orders already on their way there aren&apos;t moved.
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
          toast.success(saved.isActive ? "Station switched on" : "Station switched off", saved.name);
        }}
      />
    </>
  );
}

export default function AdminStationsPage() {
  return (
    <Suspense fallback={null}>
      <StationsScreen />
    </Suspense>
  );
}
