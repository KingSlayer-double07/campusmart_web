import type { components } from '@/lib/api/schema';

// D4: the API speaks UPPER_SNAKE values; this is the one place they become words.
type Schemas = components['schemas'];
export type ListingCategory = Schemas['ListingCategory'];
export type ProductCondition = Schemas['ProductCondition'];
export type ListingStatus = Schemas['ListingStatus'];
export type FulfillmentStatus = 'PENDING' | 'AWAITING_DROPOFF' | 'DROPPED_OFF' | 'COLLECTED' | 'CANCELLED' | 'DISPUTED';
export type PaymentMethod = 'CARD' | 'BANK_TRANSFER' | 'OPAY' | 'PALMPAY';

export const CATEGORY_LABELS: Record<ListingCategory, string> = {
  FASHION: 'Fashion',
  BEAUTY: 'Beauty',
  FOOD: 'Food',
  CREATIVE: 'Creative',
  TECH: 'Tech',
  SERVICES: 'Services',
  OTHERS: 'Others',
};

export const CONDITION_LABELS: Record<ProductCondition, string> = {
  NEW: 'Brand new',
  USED_LIKE_NEW: 'Used – like new',
  USED_GOOD: 'Used – good',
  USED_FAIR: 'Used – fair',
};

export const LISTING_STATUS_LABELS: Record<ListingStatus, string> = {
  ACTIVE: 'In stock',
  SOLDOUT: 'Out of stock',
  DRAFT: 'Draft',
  ARCHIVED: 'Archived',
  FLAGGED: 'Under review',
};

export const FULFILLMENT_STATUS_LABELS: Record<FulfillmentStatus, string> = {
  PENDING: 'Awaiting payment',
  AWAITING_DROPOFF: 'Awaiting drop-off',
  DROPPED_OFF: 'Ready for pickup',
  COLLECTED: 'Collected',
  CANCELLED: 'Cancelled',
  DISPUTED: 'Disputed',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CARD: 'Card',
  BANK_TRANSFER: 'Bank transfer',
  OPAY: 'OPay',
  PALMPAY: 'PalmPay',
};

const naira = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 2, minimumFractionDigits: 0 });

// D3: money is whole kobo everywhere; only the UI turns it into naira. 1450050 -> "₦14,500.50"
export function formatNaira(kobo: number): string {
  const sign = kobo < 0 ? '-' : '';
  const value = Math.abs(kobo) / 100;
  const text = Number.isInteger(value) ? naira.format(value) : value.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${sign}₦${text}`;
}

// A naira amount typed by a seller, as kobo (guide 3.2.6b). "14,500.5" -> 1450050
export function nairaToKobo(input: string): number | null {
  const cleaned = input.replace(/[₦,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

// Kobo shown back in a naira input: 1450050 -> "14500.5"
export const koboToNairaInput = (kobo: number): string => String(kobo / 100);

// "From ₦5,000" when options are priced differently
export function formatPriceRange(minKobo: number, maxKobo: number): string {
  return minKobo === maxKobo ? formatNaira(minKobo) : `From ${formatNaira(minKobo)}`;
}
