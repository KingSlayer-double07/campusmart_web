import {
  DeliveryJobStatus,
  DeliveryMethod,
  FulfillmentStatus,
} from '../generated/prisma/enums';

// Decision F5: 5 wrong handover codes lock the order until an admin unlocks it
export const MAX_CODE_TRIES = 5;
// Decision DX2: admins hear about a job nobody accepted within 5 hours
export const UNACCEPTED_ALERT_MS = 5 * 60 * 60 * 1000;
// Decision DL6b: admins hear about a parcel with the rider for 5 days and no buyer code
export const WITH_RIDER_ALERT_MS = 5 * 24 * 60 * 60 * 1000;
// Decision DF8b: an arrival window is at most this long
export const MAX_WINDOW_MS = 4 * 60 * 60 * 1000;

// Stores a rider still has to collect from
export const TO_COLLECT: FulfillmentStatus[] = [
  FulfillmentStatus.AWAITING_RIDER,
  FulfillmentStatus.RIDER_ASSIGNED,
];

// Before the parcel leaves the seller: the seller may still cancel (F10), and the deadline job
// still applies (DL7b, DL7c)
export const BEFORE_PICKUP: FulfillmentStatus[] = [
  ...TO_COLLECT,
  FulfillmentStatus.AWAITING_PICKUP,
];

// A delivery job still in play
export const LIVE_JOB: DeliveryJobStatus[] = [
  DeliveryJobStatus.OPEN,
  DeliveryJobStatus.ASSIGNED,
];

// 'cm-7f3k2q', ' 7F3K2Q ' and 'CM-7F3K2Q' are the same seller-order code (DX5)
export function normaliseOrderCode(input: string): string {
  const bare = input
    .trim()
    .toUpperCase()
    .replace(/^CM-?/, '')
    .replace(/\s/g, '');
  return `CM-${bare}`;
}

// Decision C7: by dispatch, the buyer sees their code once the rider has the parcel; picking up
// from the seller, as soon as it's paid. Station orders show it once dropped off (guide 6.6).
export function handoverCodeVisible(
  method: DeliveryMethod | null,
  status: FulfillmentStatus,
): boolean {
  if (method === DeliveryMethod.DISPATCH) {
    return status === FulfillmentStatus.WITH_RIDER;
  }
  if (method === DeliveryMethod.SELLER_PICKUP) {
    return status === FulfillmentStatus.AWAITING_PICKUP;
  }
  return status === FulfillmentStatus.DROPPED_OFF;
}

// Guide 6.2: sellers and riders see the buyer's username or first name, never their email
export function buyerDisplayName(buyer: {
  username: string | null;
  firstName: string | null;
}): string {
  return buyer.username ?? buyer.firstName ?? 'Buyer';
}

// Decision DX8: sellers and buyers see the rider's name only
export function riderName(rider: {
  firstName: string | null;
  lastName: string | null;
}): string {
  return (
    [rider.firstName, rider.lastName].filter(Boolean).join(' ') || 'Your rider'
  );
}

// Decision DF8b: a window the seller can plan around, before the store's pickup deadline
export function windowProblem(
  from: Date,
  to: Date,
  deadline: Date | null,
  now = new Date(),
): string | null {
  if (to.getTime() <= from.getTime())
    return 'The window must end after it starts';
  if (to.getTime() - from.getTime() > MAX_WINDOW_MS) {
    return 'Keep the window to 4 hours or less';
  }
  if (to.getTime() < now.getTime()) return 'The window has already passed';
  if (deadline && from.getTime() > deadline.getTime()) {
    return "The window starts after this store's pickup deadline";
  }
  return null;
}
