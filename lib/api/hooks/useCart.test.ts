import { describe, expect, it } from 'vitest';
import { blockingIssues, fromGuestCart, fromServerCart, quantityInCart } from './useCart';

const serverCart = {
  groups: [
    {
      seller: { id: 's1', storeName: 'Tunde Tech' },
      subtotalKobo: 900_000,
      items: [
        {
          id: 'c1',
          listing: { id: 'l1', title: 'Desk lamp', imageUrl: 'https://img/l1.jpg', category: 'TECH' },
          variant: null,
          quantity: 2,
          unitPriceKobo: 450_000,
          available: true,
          maxQuantity: 2,
        },
        {
          id: 'c2',
          listing: { id: 'l2', title: 'Old lamp', imageUrl: null, category: 'TECH' },
          variant: { id: 'v1', label: 'L', priceKobo: null, stock: 0 },
          quantity: 1,
          unitPriceKobo: 100_000,
          available: false,
          maxQuantity: 0,
        },
      ],
    },
  ],
  subtotalKobo: 900_000,
  itemCount: 3,
  issues: [
    { itemId: 'c2', listingId: 'l2', type: 'UNAVAILABLE', message: 'No longer available', available: null, previousPriceKobo: null, currentPriceKobo: null },
    { itemId: 'c1', listingId: 'l1', type: 'PRICE_CHANGED', message: 'Price went up', available: null, previousPriceKobo: 1, currentPriceKobo: 2 },
  ],
} as never;

describe('cart views', () => {
  it('reads the server cart into lines with their issues', () => {
    const view = fromServerCart(serverCart);
    expect(view.lineCount).toBe(2);
    expect(view.groups[0]).toMatchObject({ sellerId: 's1', storeName: 'Tunde Tech', subtotalKobo: 900_000 });
    expect(view.groups[0].lines[0]).toMatchObject({
      key: 'c1',
      id: 'c1',
      listingId: 'l1',
      categoryLabel: 'Tech',
      unitPriceKobo: 450_000,
      maxQuantity: 2,
      issue: { type: 'PRICE_CHANGED' },
    });
    expect(view.groups[0].lines[1]).toMatchObject({ variantId: 'v1', variantLabel: 'L', available: false, issue: { type: 'UNAVAILABLE' } });
    expect(quantityInCart({ ...view, mode: 'server' } as never, 'l1', null)).toBe(2);
    expect(quantityInCart({ ...view, mode: 'server' } as never, 'l1', 'v9')).toBe(0);
  });

  it('only a price change lets checkout go ahead', () => {
    expect(blockingIssues(fromServerCart(serverCart)).map((i) => i.type)).toEqual(['UNAVAILABLE']);
  });

  it('groups the guest cart by store, totals it, and caps at the stock seen when added', () => {
    const view = fromGuestCart([
      { id: 'l1', variantId: null, name: 'Desk lamp', priceKobo: 450_000, image: null, quantity: 2, category: 'Tech', size: 'default', stockCount: 3, sellerId: 's1', storeName: 'Tunde Tech' },
      { id: 'l2', variantId: 'v1', name: 'Cargo pants', priceKobo: 1_500_000, image: null, quantity: 1, category: 'Fashion', size: 'L', stockCount: 1, sellerId: 's2', storeName: 'Ada Wears' },
      { id: 'l3', variantId: null, name: 'Mug', priceKobo: 100_000, image: null, quantity: 1, category: 'Others', size: 'default', stockCount: 4, sellerId: 's1', storeName: 'Tunde Tech' },
    ]);
    expect(view.groups.map((g) => [g.storeName, g.subtotalKobo, g.lines.length])).toEqual([
      ['Tunde Tech', 1_000_000, 2],
      ['Ada Wears', 1_500_000, 1],
    ]);
    expect(view.subtotalKobo).toBe(2_500_000);
    expect(view.itemCount).toBe(4);
    expect(view.groups[1].lines[0]).toMatchObject({ key: 'l2|v1', id: null, variantLabel: 'L', maxQuantity: 1 });
  });
});
