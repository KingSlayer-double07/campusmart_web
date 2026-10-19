import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/labels";

const STYLES: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "bg-orange-50 text-main",
  PAID: "bg-green-100 text-green-700",
  CANCELLED: "bg-surface-muted text-foreground-muted",
  EXPIRED: "bg-surface-muted text-foreground-muted",
};

export default function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap ${STYLES[status]}`}>
      {ORDER_STATUS_LABELS[status]}
    </span>
  );
}
