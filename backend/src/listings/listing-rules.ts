import { ListingStatus } from '../generated/prisma/enums';

// Guide 3.1 rule 3: an ACTIVE listing at 0 stock becomes SOLDOUT, and a SOLDOUT one that gets
// stock back becomes ACTIVE. Drafts, archived and flagged listings keep their status.
export function nextStatus(
  status: ListingStatus,
  stock: number,
): ListingStatus {
  if (status === ListingStatus.ACTIVE && stock <= 0)
    return ListingStatus.SOLDOUT;
  if (status === ListingStatus.SOLDOUT && stock > 0)
    return ListingStatus.ACTIVE;
  return status;
}

// With variants, a listing's stock is the sum of its active variants' stock
export function stockFromVariants(
  variants: { stock: number; isActive: boolean }[],
): number {
  return variants
    .filter((v) => v.isActive)
    .reduce((sum, v) => sum + v.stock, 0);
}

// The price range a buyer can pay: variant overrides, else the listing price
export function priceRange(
  priceKobo: number,
  variants: { priceKobo: number | null; isActive: boolean }[],
) {
  const active = variants.filter((v) => v.isActive);
  const prices = active.length
    ? active.map((v) => v.priceKobo ?? priceKobo)
    : [priceKobo];
  return {
    minPriceKobo: Math.min(...prices),
    maxPriceKobo: Math.max(...prices),
  };
}

// Variants have no position column, so they're shown in a sensible order: clothing sizes
// smallest first, then everything else in natural order ('2 L' before '10 L').
const SIZES = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
export function compareVariantLabels(a: string, b: string): number {
  const sa = SIZES.indexOf(a.trim().toUpperCase());
  const sb = SIZES.indexOf(b.trim().toUpperCase());
  if (sa >= 0 && sb >= 0) return sa - sb;
  if (sa >= 0) return -1;
  if (sb >= 0) return 1;
  return a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });
}

// Option names must differ ignoring case ('M' and 'm' would confuse buyers)
export function duplicateLabel(labels: string[]): string | null {
  const seen = new Set<string>();
  for (const label of labels) {
    const key = label.trim().toLowerCase();
    if (seen.has(key)) return label;
    seen.add(key);
  }
  return null;
}

// What a seller's store is called wherever buyers see it. Never the email (guide 6.2).
export function sellerDisplayName(seller: {
  username: string | null;
  firstName: string | null;
  sellerProfile: { storeName: string | null } | null;
}): string {
  return (
    seller.sellerProfile?.storeName ??
    seller.username ??
    seller.firstName ??
    'Seller'
  );
}
