import { ListingStatus } from '../generated/prisma/enums';
import { decodeCursor, encodeCursor, escapeLike } from './listing-cursor';
import {
  compareVariantLabels,
  duplicateLabel,
  nextStatus,
  priceRange,
  sellerDisplayName,
  stockFromVariants,
} from './listing-rules';
import { recalculateListingStock } from './listing-stock';

describe('listing rules', () => {
  it('flips ACTIVE to SOLDOUT at 0 stock and back when stock returns', () => {
    expect(nextStatus(ListingStatus.ACTIVE, 0)).toBe(ListingStatus.SOLDOUT);
    expect(nextStatus(ListingStatus.SOLDOUT, 3)).toBe(ListingStatus.ACTIVE);
    expect(nextStatus(ListingStatus.ACTIVE, 3)).toBe(ListingStatus.ACTIVE);
  });

  it('leaves drafts, archived and flagged listings alone', () => {
    for (const status of [
      ListingStatus.DRAFT,
      ListingStatus.ARCHIVED,
      ListingStatus.FLAGGED,
    ]) {
      expect(nextStatus(status, 0)).toBe(status);
      expect(nextStatus(status, 5)).toBe(status);
    }
  });

  it('counts only active variants', () => {
    expect(
      stockFromVariants([
        { stock: 2, isActive: true },
        { stock: 5, isActive: false },
        { stock: 1, isActive: true },
      ]),
    ).toBe(3);
  });

  it('works out the price range from variant overrides', () => {
    expect(
      priceRange(5000, [
        { priceKobo: null, isActive: true },
        { priceKobo: 7000, isActive: true },
        { priceKobo: 100, isActive: false },
      ]),
    ).toEqual({ minPriceKobo: 5000, maxPriceKobo: 7000 });
    expect(priceRange(5000, [])).toEqual({
      minPriceKobo: 5000,
      maxPriceKobo: 5000,
    });
  });

  it('orders sizes smallest first and other labels naturally', () => {
    expect(['XL', 'S', 'L', 'M'].sort(compareVariantLabels)).toEqual([
      'S',
      'M',
      'L',
      'XL',
    ]);
    expect(['10 L', '2 L', 'Black'].sort(compareVariantLabels)).toEqual([
      '2 L',
      '10 L',
      'Black',
    ]);
  });

  it('spots option names that only differ by case', () => {
    expect(duplicateLabel(['S', 'M', 'm'])).toBe('m');
    expect(duplicateLabel(['S', 'M'])).toBeNull();
  });

  it("never shows a seller's email: store name, then username, then first name", () => {
    expect(
      sellerDisplayName({
        username: 'ada',
        firstName: 'Ada',
        sellerProfile: { storeName: 'Ada Wears' },
      }),
    ).toBe('Ada Wears');
    expect(
      sellerDisplayName({
        username: null,
        firstName: null,
        sellerProfile: null,
      }),
    ).toBe('Seller');
  });
});

describe('escapeLike', () => {
  it('makes % and _ mean themselves in a search', () => {
    expect(escapeLike('50% off_now')).toBe('50\\% off\\_now');
  });
});

describe('listing cursors', () => {
  it('round-trips and refuses a cursor from another sort', () => {
    const raw = encodeCursor({
      s: 'price_asc',
      c: '2026-10-09T10:00:00.000Z',
      i: 'l1',
      p: 5000,
    });
    expect(decodeCursor(raw, 'price_asc')).toEqual({
      s: 'price_asc',
      c: '2026-10-09T10:00:00.000Z',
      i: 'l1',
      p: 5000,
    });
    expect(() => decodeCursor(raw, 'newest')).toThrow();
    expect(() => decodeCursor('not-json', 'newest')).toThrow();
  });
});

describe('recalculateListingStock', () => {
  const db = (listing: object) => ({
    listing: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(listing),
      update: jest.fn(),
    },
  });

  it('selling the last variant unit flips the listing to SOLDOUT', async () => {
    const mock = db({
      stock: 1,
      status: ListingStatus.ACTIVE,
      variants: [
        { stock: 0, isActive: true }, // the last unit just sold
        { stock: 0, isActive: true },
      ],
    });
    await expect(recalculateListingStock(mock as never, 'l1')).resolves.toEqual(
      { stock: 0, status: ListingStatus.SOLDOUT },
    );
    expect(mock.listing.update).toHaveBeenCalledWith({
      where: { id: 'l1' },
      data: { stock: 0, status: ListingStatus.SOLDOUT },
    });
  });

  it('writes nothing when nothing changed', async () => {
    const mock = db({ stock: 4, status: ListingStatus.ACTIVE, variants: [] });
    await recalculateListingStock(mock as never, 'l1');
    expect(mock.listing.update).not.toHaveBeenCalled();
  });
});
