// How order times and outcomes read on the order screens (Phase 6). West Africa Time throughout.
const zone = 'Africa/Lagos';
const day = new Intl.DateTimeFormat('en-NG', { weekday: 'short', day: 'numeric', month: 'short', timeZone: zone });
const time = new Intl.DateTimeFormat('en-NG', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: zone });

export const dayText = (iso: string) => day.format(new Date(iso));
export const timeText = (iso: string) => time.format(new Date(iso));
export const whenText = (iso: string) => `${dayText(iso)}, ${timeText(iso)}`;

// "Sat, 18 Oct, 14:00 to 16:00" (decision DF8b)
export function windowText(from: string, to: string): string {
  return `${dayText(from)}, ${timeText(from)} to ${timeText(to)}`;
}

// Why a store's order was cancelled, in words
export function cancelReasonText(reason: string | null): string {
  switch (reason) {
    case 'SELLER_CANCELLED':
      return 'Cancelled by the seller';
    case 'MISSED_PICKUP_DEADLINE':
      return 'Not collected from the seller in time';
    case 'NOT_COLLECTED':
      return 'Not collected by the buyer in time';
    case 'DISPUTE_REFUND':
      return 'Refunded after a reported problem';
    case 'ADMIN_REFUND':
      return 'Refunded by CampusMart';
    case 'PAYMENT_EXPIRED':
      return 'Not paid in time';
    case 'BUYER_CANCELLED':
      return 'Cancelled by the buyer';
    default:
      return 'Cancelled';
  }
}
