import { ListingStatus } from '../generated/prisma/enums';

export const MAX_CART_LINES = 50;
export const MAX_LINE_QUANTITY = 100;

export interface LineVariant {
  id: string;
  label: string;
  priceKobo: number | null;
  stock: number;
  isActive: boolean;
}

export interface LineListing {
  id: string;
  status: ListingStatus;
  isDeleted: boolean;
  institutionId: string;
  sellerId: string;
  priceKobo: number;
  stock: number;
  variants: LineVariant[];
}

export type LineProblem =
  | 'UNAVAILABLE' // gone, not live, or at another school
  | 'OUT_OF_STOCK' // live but nothing left (SOLDOUT, or this option has 0)
  | 'VARIANT_REQUIRED'
  | 'VARIANT_UNAVAILABLE'
  | 'OWN_LISTING';

export interface LineState {
  variant: LineVariant | null;
  unitPriceKobo: number;
  /** Units the buyer could take right now */
  stock: number;
  problem: LineProblem | null;
}

// Whether a buyer can have this listing (and option) in their cart, at what price and how many
// (guide 4.1). Checkout runs the same checks before it reserves stock (4.2 step 2).
export function lineState(
  listing: LineListing,
  variantId: string | null | undefined,
  buyer: { id: string; institutionId: string },
): LineState {
  const variant = variantId
    ? (listing.variants.find((v) => v.id === variantId && v.isActive) ?? null)
    : null;
  const unitPriceKobo = variant?.priceKobo ?? listing.priceKobo;
  const stock = Math.max(0, variant ? variant.stock : listing.stock);
  const state = (problem: LineProblem | null): LineState => ({
    variant,
    unitPriceKobo,
    stock: problem ? 0 : stock,
    problem,
  });

  const live =
    !listing.isDeleted &&
    listing.institutionId === buyer.institutionId &&
    (listing.status === ListingStatus.ACTIVE ||
      listing.status === ListingStatus.SOLDOUT);
  if (!live) return state('UNAVAILABLE');
  if (listing.sellerId === buyer.id) return state('OWN_LISTING');
  if (variantId && !variant) return state('VARIANT_UNAVAILABLE');
  if (!variantId && listing.variants.length > 0)
    return state('VARIANT_REQUIRED');
  if (listing.status === ListingStatus.SOLDOUT || stock === 0)
    return state('OUT_OF_STOCK');
  return state(null);
}

export const maxQuantity = (state: LineState) =>
  Math.min(state.stock, MAX_LINE_QUANTITY);

export type CartIssueType =
  | 'UNAVAILABLE'
  | 'OUT_OF_STOCK'
  | 'LOW_STOCK'
  | 'PRICE_CHANGED';

export interface CartIssue {
  itemId: string;
  listingId: string;
  type: CartIssueType;
  message: string;
  available: number | null;
  previousPriceKobo: number | null;
  currentPriceKobo: number | null;
}

// "₦4,500", or "₦4,000.50" when there are kobo
const naira = (kobo: number) =>
  `₦${(kobo / 100).toLocaleString('en-NG', {
    minimumFractionDigits: kobo % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;

// What the cart should warn about before checkout (guide 4.1): lines that went out of stock or
// away, quantities above what's left, and prices that changed since the line was last set.
export function lineIssue(
  line: {
    id: string;
    listingId: string;
    quantity: number;
    unitPriceKobo: number | null;
  },
  state: LineState,
): CartIssue | null {
  const base = {
    itemId: line.id,
    listingId: line.listingId,
    available: null,
    previousPriceKobo: null,
    currentPriceKobo: null,
  };
  if (state.problem === 'OUT_OF_STOCK') {
    return {
      ...base,
      type: 'OUT_OF_STOCK',
      message: 'Sold out',
      available: 0,
    };
  }
  if (state.problem) {
    return {
      ...base,
      type: 'UNAVAILABLE',
      message:
        state.problem === 'VARIANT_UNAVAILABLE' ||
        state.problem === 'VARIANT_REQUIRED'
          ? 'This option is no longer available'
          : 'No longer available',
    };
  }
  if (line.quantity > state.stock) {
    return {
      ...base,
      type: 'LOW_STOCK',
      message: `Only ${state.stock} left`,
      available: state.stock,
    };
  }
  if (
    line.unitPriceKobo !== null &&
    line.unitPriceKobo !== state.unitPriceKobo
  ) {
    return {
      ...base,
      type: 'PRICE_CHANGED',
      message: `Price ${state.unitPriceKobo > line.unitPriceKobo ? 'went up' : 'dropped'} from ${naira(line.unitPriceKobo)} to ${naira(state.unitPriceKobo)}`,
      previousPriceKobo: line.unitPriceKobo,
      currentPriceKobo: state.unitPriceKobo,
    };
  }
  return null;
}
