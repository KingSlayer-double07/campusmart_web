"use client";

import { Suspense } from "react";
import { Ban, ShieldCheck, UserCog, Users } from "lucide-react";
import { ToastContainer, useToast } from "@/app/components/Toast";
import { useAuthStore } from "@/app/store/useAuthStore";
import { useAdminUsers, useSetSuspended } from "@/lib/api/hooks/useAdminModeration";
import { ROLE_LABELS, type AdminUser, type UserRole } from "@/lib/api/moderation";
import { dayText } from "@/lib/orderText";
import AdminPageHeader from "../components/AdminPageHeader";
import ConfirmDialog from "../components/ConfirmDialog";
import DataTable, { RowAction, type Column } from "../components/DataTable";
import EmptyState from "../components/EmptyState";
import FilterBar from "../components/FilterBar";
import { Select } from "../components/fields";
import { useDialog } from "../components/useDialog";
import { useUrlFilters } from "../components/useUrlFilters";
import RoleDialog from "./RoleDialog";

const STATUS_TABS = [
  { value: "", label: "Everyone" },
  { value: "SUSPENDED", label: "Suspended" },
] as const;

const ROLE_FILTERS: UserRole[] = ["BUYER", "SELLER", "ADMIN", "DISPATCH"];

const columns: Column<AdminUser>[] = [
  {
    key: "user",
    header: "User",
    cell: (u) => (
      <div className="min-w-0 text-xs">
        <p className="truncate text-sm font-semibold text-foreground">{u.name ?? u.email}</p>
        {u.name && <p className="truncate text-foreground-muted">{u.email}</p>}
      </div>
    ),
  },
  {
    key: "role",
    header: "Role",
    cell: (u) => (
      <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-semibold text-foreground">{ROLE_LABELS[u.role]}</span>
    ),
  },
  { key: "school", header: "School", hideOnPhone: true, cell: (u) => u.institutionName ?? "No school" },
  {
    key: "status",
    header: "Status",
    wide: true,
    cell: (u) =>
      u.isSuspended ? (
        <div className="text-xs">
          <p className="font-semibold text-red-600">Suspended{u.suspendedAt ? ` on ${dayText(u.suspendedAt)}` : ""}</p>
          {u.suspendedReason && <p className="mt-0.5 break-words text-foreground-muted">{u.suspendedReason}</p>}
        </div>
      ) : (
        <p className="text-xs text-foreground-muted">
          {!u.isActive ? "Switched off" : u.emailVerified ? "Active" : "Email not confirmed"}
          {u.verificationStatus === "VERIFIED" && " · verified seller"}
        </p>
      ),
  },
  { key: "joined", header: "Joined", className: "whitespace-nowrap", hideOnPhone: true, cell: (u) => dayText(u.createdAt) },
];

// Guide 9.1: users and roles. Admins give other admins the role (M1) and suspend with a reason the
// user sees at sign-in (M6). Riders are managed on the riders screen.
function UsersScreen() {
  const toast = useToast();
  const me = useAuthStore((s) => s.user);
  const [filters, setFilters] = useUrlFilters(["q", "role", "tab"] as const);
  const role = ROLE_FILTERS.includes(filters.role as UserRole) ? (filters.role as UserRole) : undefined;
  const users = useAdminUsers({
    q: filters.q || undefined,
    role,
    suspended: filters.tab === "SUSPENDED" || undefined,
  });
  const setSuspended = useSetSuspended();
  const roleDialog = useDialog<AdminUser>();
  const suspending = useDialog<AdminUser>();
  const lifting = useDialog<AdminUser>();
  const filtered = !!(filters.q || role || filters.tab);

  return (
    <>
      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} />
      <div className="flex flex-col gap-6">
        <AdminPageHeader
          title="Users"
          description="Everyone on CampusMart. Change a role, or suspend someone: they're signed out at once, their live listings come down, and they see your reason when they try to sign in."
        />
        <FilterBar
          search={filters.q}
          onSearch={(q) => setFilters({ q })}
          searchPlaceholder="Search by email or name"
          status={filters.tab}
          onStatus={(tab) => setFilters({ tab })}
          statusTabs={STATUS_TABS}
        >
          <Select aria-label="Role" value={role ?? ""} onChange={(e) => setFilters({ role: e.target.value })} className="sm:w-44">
            <option value="">All roles</option>
            {ROLE_FILTERS.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}s
              </option>
            ))}
          </Select>
        </FilterBar>
        <DataTable
          label="Users"
          columns={columns}
          rows={users.data?.pages.flatMap((p) => p.items)}
          rowKey={(u) => u.id}
          isLoading={users.isPending}
          isError={users.isError}
          onRetry={() => users.refetch()}
          hasMore={users.hasNextPage}
          onLoadMore={() => users.fetchNextPage()}
          isLoadingMore={users.isFetchingNextPage}
          rowActions={(u) => {
            // Your own account, and riders (managed on their own screen), have no actions here
            if (u.id === me?.id || u.role === "DISPATCH" || u.role === "PICKUP_AGENT") return null;
            return (
              <>
                {!u.isSuspended && (
                  <RowAction icon={UserCog} onClick={() => roleDialog.show(u)}>
                    Change role
                  </RowAction>
                )}
                {u.isSuspended ? (
                  <RowAction icon={ShieldCheck} onClick={() => lifting.show(u)}>
                    Lift suspension
                  </RowAction>
                ) : (
                  u.role !== "ADMIN" && (
                    <RowAction icon={Ban} tone="danger" onClick={() => suspending.show(u)}>
                      Suspend
                    </RowAction>
                  )
                )}
              </>
            );
          }}
          empty={
            <EmptyState
              icon={Users}
              title={filtered ? "No one matches" : "No users yet"}
              description={filtered ? "Try another search or filter." : "People appear here as they sign up."}
            />
          }
        />
      </div>
      <RoleDialog
        user={roleDialog.target}
        isOpen={roleDialog.open}
        onClose={roleDialog.close}
        onChanged={(u) => toast.success("Role changed", `${u.name ?? u.email} is now ${ROLE_LABELS[u.role].toLowerCase()}`)}
      />
      <ConfirmDialog
        isOpen={suspending.open}
        onClose={suspending.close}
        tone="danger"
        title={`Suspend ${suspending.target?.name ?? suspending.target?.email ?? "this user"}?`}
        description="They're signed out everywhere at once and their live listings are archived. Orders already placed stay for admins to handle. They'll see your reason when they try to sign in."
        confirmLabel="Suspend"
        reasonPlaceholder="For example: sold counterfeit phones"
        onConfirm={async (reason) => {
          await setSuspended.mutateAsync({ id: suspending.target!.id, reason: reason! });
          toast.success("User suspended", "They've been signed out");
        }}
      />
      <ConfirmDialog
        isOpen={lifting.open}
        onClose={lifting.close}
        tone="default"
        title="Lift the suspension?"
        description="They can sign in again. Listings archived during the suspension stay archived until they publish them."
        confirmLabel="Lift suspension"
        onConfirm={async () => {
          await setSuspended.mutateAsync({ id: lifting.target!.id, reason: null });
          toast.success("Suspension lifted");
        }}
      />
    </>
  );
}

export default function AdminUsersPage() {
  return (
    <Suspense fallback={null}>
      <UsersScreen />
    </Suspense>
  );
}
