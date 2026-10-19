import {
  DeliveryMethod,
  Fault,
  FulfillmentStatus,
  PaymentMethod,
} from '../generated/prisma/enums';
import type { PaystackTransaction } from '../paystack/paystack.service';

const DAY_MS = 24 * 60 * 60 * 1000;

// Guide 5.1 step 3: card and bank transfer always; OPay and PalmPay only once Paystack confirms a
// channel for them (decision P5), until then paying by bank transfer or USSD as the guide says
export function enabledMethods(walletsEnabled: boolean): PaymentMethod[] {
  return walletsEnabled
    ? [
        PaymentMethod.CARD,
        PaymentMethod.BANK_TRANSFER,
        PaymentMethod.OPAY,
        PaymentMethod.PALMPAY,
      ]
    : [PaymentMethod.CARD, PaymentMethod.BANK_TRANSFER];
}

export function channelsFor(method: PaymentMethod): string[] {
  switch (method) {
    case PaymentMethod.CARD:
      return ['card'];
    case PaymentMethod.BANK_TRANSFER:
      return ['bank_transfer'];
    default:
      return ['bank_transfer', 'ussd'];
  }
}

// Each attempt on an order gets its own reference (decision P7)
export const paymentReference = (orderId: string, attempt: number) =>
  `CM_${orderId}_${attempt}`;
export const payoutReference = (sellerOrderId: string, attempt: number) =>
  `PO_${sellerOrderId}_${attempt}`;

// Guide 5.2 step 5b: a charge only counts when Paystack says success for exactly what we asked
export function chargeProblem(
  expectedKobo: number,
  data: Pick<PaystackTransaction, 'amount' | 'currency' | 'status'>,
): string | null {
  if (data.status !== 'success') return `status ${data.status}`;
  if (data.currency !== 'NGN') return `currency ${data.currency}`;
  if (data.amount !== expectedKobo)
    return `amount ${data.amount} instead of ${expectedKobo}`;
  return null;
}

// What a seller order becomes once its order is paid: by rider, it waits for a rider to collect
// within the pickup deadline (DL7b); pickup, the buyer has BUYER_COLLECT_DAYS (DL7c). Orders from
// before delivery keep the station flow.
export function fulfilmentOnPayment(
  method: DeliveryMethod | null,
  paidAt: Date,
  days: { pickupDeadlineDays: number; buyerCollectDays: number },
) {
  const after = (n: number) => new Date(paidAt.getTime() + n * DAY_MS);
  if (method === DeliveryMethod.DISPATCH) {
    return {
      fulfillmentStatus: FulfillmentStatus.AWAITING_RIDER,
      pickupDeadline: after(days.pickupDeadlineDays),
      dropOffDeadline: null,
    };
  }
  if (method === DeliveryMethod.SELLER_PICKUP) {
    return {
      fulfillmentStatus: FulfillmentStatus.AWAITING_PICKUP,
      pickupDeadline: after(days.buyerCollectDays),
      dropOffDeadline: null,
    };
  }
  return {
    fulfillmentStatus: FulfillmentStatus.AWAITING_DROPOFF,
    pickupDeadline: null,
    dropOffDeadline: after(days.pickupDeadlineDays),
  };
}

// Decision P6 and DF5/DF9: a refund gives back the seller order's items; the order's delivery fee
// only when it's the last of the order to be refunded and nothing was picked up; and when it's the
// buyer's fault, that seller order's share of Paystack's fee (split by subtotal) is kept back.
export function refundAmounts(input: {
  itemsKobo: number;
  orderSubtotalKobo: number;
  paystackFeesKobo: number;
  fault: Fault;
  deliveryFeeKobo: number;
}) {
  const paystackFeeKobo =
    input.fault === Fault.BUYER && input.orderSubtotalKobo > 0
      ? Math.round(
          (input.paystackFeesKobo * input.itemsKobo) / input.orderSubtotalKobo,
        )
      : 0;
  const gross = input.itemsKobo + input.deliveryFeeKobo;
  return {
    itemsKobo: input.itemsKobo,
    deliveryFeeKobo: input.deliveryFeeKobo,
    paystackFeeKobo: Math.min(paystackFeeKobo, gross),
    amountKobo: Math.max(0, gross - paystackFeeKobo),
  };
}

// Statuses that mean a parcel has left the seller: with the rider or handed over (Phase 6), or
// dropped off and collected at a station (the older flow). Refunds also check pickedUpAt.
export const PICKED_UP_STATUSES: FulfillmentStatus[] = [
  FulfillmentStatus.WITH_RIDER,
  FulfillmentStatus.DELIVERED,
  FulfillmentStatus.DROPPED_OFF,
  FulfillmentStatus.COLLECTED,
];

// Handed over to the buyer, by the rider or by the seller; the 48-hour window then runs (D11)
export const HANDED_OVER_STATUSES: FulfillmentStatus[] = [
  FulfillmentStatus.DELIVERED,
  FulfillmentStatus.COLLECTED,
];
