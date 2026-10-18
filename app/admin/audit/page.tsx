"use client";

import { Suspense, useEffect, useState } from "react";
import { ScrollText } from "lucide-react";
import { useAuditLog } from "@/lib/api/hooks/useAdminModeration";
import type { AuditEntry } from "@/lib/api/moderation";
import { whenText } from "@/lib/orderText";
import AdminPageHeader from "../components/AdminPageHeader";
import DataTable, { type Column } from "../components/DataTable";
import EmptyState from "../components/EmptyState";
import { Select, TextInput } from "../components/fields";
import { useUrlFilters } from "../components/useUrlFilters";

// The records the API audits (guide 5.5, 6.1, 9.1)
const ENTITY_TYPES = [
  "User",
  "Listing",
  "SupportReport",
  "Review",
  "Institution",
  "CampusPlace",
  "PickupStation",
  "VerificationRequest",
  "SellerProfile",
  "Order",
  "SellerOrder",
  "Payment",
  "Refund",
  "Payout",
  "Dispute",
  "DeliveryJob",
  "ProblemReport",
  "PlatformSetting",
];

const ENTITY_LABELS: Record<string, string> = {
  SupportReport: "Report",
  CampusPlace: "Campus place",
  PickupStation: "Pickup station",
  VerificationRequest: "Verification",
  SellerProfile: "Store",
  SellerOrder: "Store order",
  DeliveryJob: "Delivery",
  ProblemReport: "Problem",
  PlatformSetting: "Setting",
};

const entityLabel = (type: string) => ENTITY_LABELS[type] ?? type;
// USER_SUSPENDED → "User suspended"
const actionText = (action: string) => action.charAt(0) + action.slice(1).toLowerCase().replace(/_/g, " ");

function metaText(meta: AuditEntry["meta"]): string | null {
  if (!meta) return null;
  const parts = Object.entries(meta)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`);
  return parts.length ? parts.join(" · ") : null;
}

const columns: Column<AuditEntry>[] = [
  {
    key: "what",
    header: "What",
    wide: true,
    cell: (e) => {
      const details = metaText(e.meta);
      return (
        <div className="min-w-0 text-xs">
          <p className="text-sm font-semibold text-foreground">{actionText(e.action)}</p>
          {details && <p className="mt-0.5 break-words font-mono text-[11px] text-foreground-muted">{details}</p>}
        </div>
      );
    },
  },
  {
    key: "record",
    header: "Record",
    cell: (e) => (
      <div className="min-w-0 text-xs">
        <p className="font-semibold">{entityLabel(e.entityType)}</p>
        <p className="break-all font-mono text-[11px] text-foreground-muted">{e.entityId}</p>
      </div>
    ),
  },
  { key: "who", header: "Who", cell: (e) => <span className="break-all text-xs">{e.actorEmail ?? (e.actorId ? "A removed user" : "System")}</span> },
  { key: "when", header: "When", className: "whitespace-nowrap", cell: (e) => whenText(e.createdAt) },
];

// Guide 9.1: who did what, and when, newest first. Filters live in the URL so an entry can be shared.
function AuditScreen() {
  const [filters, setFilters] = useUrlFilters(["entityType", "entityId"] as const);
  const [entityId, setEntityId] = useState(filters.entityId);
  useEffect(() => setEntityId(filters.entityId), [filters.entityId]);
  const log = useAuditLog({
    entityType: filters.entityType || undefined,
    entityId: filters.entityId || undefined,
  });
  const filtered = !!(filters.entityType || filters.entityId);

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Audit log"
        description="Every admin change and every money movement: who did it, what changed and when. Nothing here can be edited."
      />
      <form
        className="flex flex-col gap-3 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          setFilters({ entityId: entityId.trim() });
        }}
      >
        <Select
          aria-label="Record type"
          value={filters.entityType}
          onChange={(e) => setFilters({ entityType: e.target.value })}
          className="sm:w-56"
        >
          <option value="">Every record</option>
          {ENTITY_TYPES.map((t) => (
            <option key={t} value={t}>
              {entityLabel(t)}
            </option>
          ))}
        </Select>
        <TextInput
          aria-label="Record id"
          placeholder="Record id, then press Enter"
          value={entityId}
          onChange={(e) => setEntityId(e.target.value)}
          onBlur={() => setFilters({ entityId: entityId.trim() })}
          className="font-mono sm:flex-1"
        />
      </form>
      <DataTable
        label="Audit log"
        columns={columns}
        rows={log.data?.pages.flatMap((p) => p.items)}
        rowKey={(e) => e.id}
        isLoading={log.isPending}
        isError={log.isError}
        onRetry={() => log.refetch()}
        hasMore={log.hasNextPage}
        onLoadMore={() => log.fetchNextPage()}
        isLoadingMore={log.isFetchingNextPage}
        empty={
          <EmptyState
            icon={ScrollText}
            title={filtered ? "Nothing matches" : "Nothing logged yet"}
            description={filtered ? "Try another record type or id." : "Admin changes and money movements appear here as they happen."}
          />
        }
      />
    </div>
  );
}

export default function AdminAuditPage() {
  return (
    <Suspense fallback={null}>
      <AuditScreen />
    </Suspense>
  );
}
