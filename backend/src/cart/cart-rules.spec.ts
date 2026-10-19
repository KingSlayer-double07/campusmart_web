import { ListingStatus } from '../generated/prisma/enums';
import {
  lineIssue,
  lineState,
  maxQuantity,
  type LineListing,
} from './cart-rules';

const buyer = { id: 'buyer', institutionId: 'school-a' };
const listing = (overrides: Partial<LineListing> = {}): LineListing => ({
  id: 'l1',
  status: ListingStatus.ACTIVE,
  isDeleted: false,
  institutionId: 'school-a',
  sellerId: 'seller',
  priceKobo: 450_000,
  stock: 5,
  variants: [],
  ...overrides,
});
const sized = listing({
  stock: 3,
  variants: [
    { id: 'm', label: 'M', priceKobo: null, stock: 2, isActive: true },
    { id: 'l', label: 'L', priceKobo: 500_000, stock: 1, isActive: true },
    { id: 'xl', label: 'XL', priceKobo: null, stock: 4, isActive: false },
  ],
});

describe('lineState', () => {
  it('prices and counts a plain listing, or the chosen option', () => {
    expect(lineState(listing(), undefined, buyer)).toMatchObject({
      unitPriceKobo: 450_000,
      stock: 5,
      problem: null,
    });
    expect(lineState(sized, 'l', buyer)).toMatchObject({
      unitPriceKobo: 500_000,
      stock: 1,
      problem: null,
    });
    expect(lineState(sized, 'm', buyer).unitPriceKobo).toBe(450_000);
  });

  it.each([
    ['deleted', { isDeleted: true }],
    ['a draft', { status: ListingStatus.DRAFT }],
    ['archived', { status: ListingStatus.ARCHIVED }],
    ['under review', { status: ListingStatus.FLAGGED }],
    ['at another school', { institutionId: 'school-b' }],
  ])('a listing that is %s is unavailable', (_name, overrides) => {
    const state = lineState(listing(overrides), undefined, buyer);
    expect(state).toMatchObject({ problem: 'UNAVAILABLE', stock: 0 });
  });

  it('flags your own listing, a missing option and an inactive option', () => {
    expect(
      lineState(listing({ sellerId: 'buyer' }), undefined, buyer).problem,
    ).toBe('OWN_LISTING');
    expect(lineState(sized, undefined, buyer).problem).toBe('VARIANT_REQUIRED');
    expect(lineState(sized, 'xl', buyer).problem).toBe('VARIANT_UNAVAILABLE');
    expect(lineState(sized, 'gone', buyer).problem).toBe('VARIANT_UNAVAILABLE');
  });

  it('a sold-out listing or option is out of stock', () => {
    expect(
      lineState(
        listing({ status: ListingStatus.SOLDOUT, stock: 0 }),
        undefined,
        buyer,
      ).problem,
    ).toBe('OUT_OF_STOCK');
    const empty = listing({
      variants: [
        { id: 'm', label: 'M', priceKobo: null, stock: 0, isActive: true },
      ],
    });
    expect(lineState(empty, 'm', buyer).problem).toBe('OUT_OF_STOCK');
  });

  it('caps the quantity at 100', () => {
    expect(
      maxQuantity(lineState(listing({ stock: 500 }), undefined, buyer)),
    ).toBe(100);
    expect(
      maxQuantity(lineState(listing({ stock: 2 }), undefined, buyer)),
    ).toBe(2);
  });
});

describe('lineIssue', () => {
  const line = {
    id: 'c1',
    listingId: 'l1',
    quantity: 2,
    unitPriceKobo: 450_000,
  };

  it('is quiet when nothing changed', () => {
    expect(lineIssue(line, lineState(listing(), undefined, buyer))).toBeNull();
    // Lines saved before prices were recorded never warn about price
    expect(
      lineIssue(
        { ...line, unitPriceKobo: null },
        lineState(listing({ priceKobo: 1 }), undefined, buyer),
      ),
    ).toBeNull();
  });

  it('warns about stock before price', () => {
    expect(
      lineIssue(
        line,
        lineState(listing({ stock: 1, priceKobo: 9 }), undefined, buyer),
      ),
    ).toMatchObject({
      type: 'LOW_STOCK',
      message: 'Only 1 left',
      available: 1,
    });
    expect(
      lineIssue(
        line,
        lineState(
          listing({ status: ListingStatus.SOLDOUT, stock: 0 }),
          undefined,
          buyer,
        ),
      ),
    ).toMatchObject({ type: 'OUT_OF_STOCK', available: 0 });
    expect(
      lineIssue(
        line,
        lineState(listing({ isDeleted: true }), undefined, buyer),
      ),
    ).toMatchObject({ type: 'UNAVAILABLE', message: 'No longer available' });
    expect(lineIssue(line, lineState(sized, 'gone', buyer))).toMatchObject({
      type: 'UNAVAILABLE',
      message: 'This option is no longer available',
    });
  });

  it('says how a price changed', () => {
    expect(
      lineIssue(
        line,
        lineState(listing({ priceKobo: 500_000 }), undefined, buyer),
      ),
    ).toMatchObject({
      type: 'PRICE_CHANGED',
      message: 'Price went up from ₦4,500 to ₦5,000',
      previousPriceKobo: 450_000,
      currentPriceKobo: 500_000,
    });
    expect(
      lineIssue(
        line,
        lineState(listing({ priceKobo: 400_050 }), undefined, buyer),
      )?.message,
    ).toBe('Price dropped from ₦4,500 to ₦4,000.50');
  });
});
