"use client";

import { Suspense } from "react";
import { Bike, Mail, Power, UserPlus } from "lucide-react";
import Button from "@/app/components/Button";
import { ToastContainer, useToast } from "@/app/components/Toast";
import type { AdminRider } from "@/lib/api/dispatch";
import { useAdminInstitutions } from "@/lib/api/hooks/useAdminInstitutions";
import { useAdminRiders, useResendInvite, useSetRiderActive } from "@/lib/api/hooks/useAdminDispatch";
import AdminPageHeader from "../components/AdminPageHeader";
import ConfirmDialog from "../components/ConfirmDialog";
import DataTable, { RowAction, type Column } from "../components/DataTable";
import EmptyState from "../components/EmptyState";
import Tabs from "../components/Tabs";
import { useDialog } from "../components/useDialog";
import { useUrlFilters } from "../components/useUrlFilters";
import InviteRiderDialog from "./InviteRiderDialog";

const TABS = [
  { value: "", label: "All" },
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Switched off" },
] as const;

const riderName = (r: AdminRider) => [r.firstName, r.lastName].filter(Boolean).join(" ") || r.email;

function StatusPill({ rider }: { rider: AdminRider }) {
  const [text, style] = !rider.isActive
    ? ["Switched off", "bg-surface-muted text-foreground-muted"]
    : rider.invitePending
      ? ["Invite sent", "bg-orange-50 text-main"]
      : ["Active", "bg-green-100 text-green-700"];
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap ${style}`}>{text}</span>;
}

const columns: Column<AdminRider>[] = [
  {
    key: "rider",
    header: "Rider",
    cell: (r) => (
      <div className="min-w-0">
        <p className="font-semibold text-foreground break-words">{riderName(r)}</p>
        <p className="mt-0.5 truncate text-xs text-foreground-muted">{r.email}</p>
        {r.phone && <p className="text-xs text-foreground-muted">{r.phone}</p>}
      </div>
    ),
  },
  { key: "campus", header: "Campus", hideOnPhone: true, cell: (r) => r.institution.name },
  { key: "status", header: "Status", cell: (r) => <StatusPill rider={r} /> },
  { key: "jobs", header: "Jobs now", hideOnPhone: true, cell: (r) => r.activeJobs },
];

// Phase 6 (decisions DX1, C5): invite riders, see who's active, switch them off
function RidersScreen() {
  const toast = useToast();
  const [filters, setFilters] = useUrlFilters(["status"] as const);
  const status = filters.status === "ACTIVE" || filters.status === "INACTIVE" ? filters.status : "";
  const riders = useAdminRiders(status ? { status } : {});
  const institutions = useAdminInstitutions({ limit: 100 });
  const resend = useResendInvite();
  const setActive = useSetRiderActive();
  const inviting = useDialog<null>();
  const toggling = useDialog<AdminRider>();
  const rows = riders.data?.pages.flatMap((p) => p.items);
  const target = toggling.target;

  return (
    <>
      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} />
      <div className="flex flex-col gap-6">
        <AdminPageHeader
          title="Riders"
          description="Riders deliver orders on their campus. Invite them by email; they set a password from the link. A rider holding a job can be switched off once it's reassigned."
          action={
            <Button className="sm:w-auto" onClick={() => inviting.show(null)}>
              <UserPlus size={16} /> Invite rider
            </Button>
          }
        />
        <Tabs tabs={TABS} value={status} onChange={(value) => setFilters({ status: value })} />
        <DataTable
          label="Riders"
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          isLoading={riders.isPending}
          isError={riders.isError}
          onRetry={() => riders.refetch()}
          hasMore={riders.hasNextPage}
          onLoadMore={() => riders.fetchNextPage()}
          isLoadingMore={riders.isFetchingNextPage}
          rowActions={(r) => (
            <>
              {r.invitePending && r.isActive && (
                <RowAction
                  icon={Mail}
                  onClick={async () => {
                    try {
                      await resend.mutateAsync(r.id);
                      toast.success("Invite sent again", `A new link went to ${r.email}`);
                    } catch {
                      toast.error("Couldn't resend the invite");
                    }
                  }}
                >
                  Resend invite
                </RowAction>
              )}
              <RowAction icon={Power} tone={r.isActive ? "danger" : "default"} onClick={() => toggling.show(r)}>
                {r.isActive ? "Switch off" : "Switch on"}
              </RowAction>
            </>
          )}
          empty={
            <EmptyState
              icon={Bike}
              title="No riders yet"
              description="Invite the people who will deliver orders. Each one belongs to one campus."
            />
          }
        />
      </div>

      <InviteRiderDialog
        isOpen={inviting.open}
        onClose={inviting.close}
        institutions={institutions.data?.pages.flatMap((p) => p.items) ?? []}
        onInvited={(rider) => toast.success("Invite sent", `${rider.email} can now set a password from the email`)}
      />
      <ConfirmDialog
        isOpen={toggling.open}
        onClose={toggling.close}
        tone={target?.isActive ? "danger" : "default"}
        requireReason
        title={target?.isActive ? "Switch this rider off?" : "Switch this rider on?"}
        description={
          target?.isActive
            ? `${target ? riderName(target) : ""} is signed out and stops seeing jobs.`
            : `${target ? riderName(target) : ""} can sign in and take jobs again.`
        }
        confirmLabel={target?.isActive ? "Switch off" : "Switch on"}
        reasonPlaceholder="For example: left the team"
        onConfirm={async (reason) => {
          const updated = await setActive.mutateAsync({ id: target!.id, isActive: !target!.isActive, reason: reason! });
          toast.success(updated.isActive ? "Rider switched on" : "Rider switched off", riderName(updated));
        }}
      />
    </>
  );
}

export default function AdminRidersPage() {
  return (
    <Suspense fallback={null}>
      <RidersScreen />
    </Suspense>
  );
}
