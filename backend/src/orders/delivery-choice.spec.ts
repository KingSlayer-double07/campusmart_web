import { HttpException } from '@nestjs/common';
import { DeliveryMethod } from '../generated/prisma/enums';
import { assertOneDestination, chooseMethods } from './delivery-choice';

const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return ((e as HttpException).getResponse() as { code?: string }).code;
  }
  return null;
};

const stores = [
  { sellerId: 'ada', storeName: 'Ada Wears', offersPickup: true },
  { sellerId: 'tunde', storeName: 'Tunde Tech', offersPickup: false },
];
const { DISPATCH, SELLER_PICKUP } = DeliveryMethod;

describe('chooseMethods', () => {
  it('gives each store in the cart its own method (decision DM1)', () => {
    const methods = chooseMethods(stores, [
      { sellerId: 'ada', method: SELLER_PICKUP },
      { sellerId: 'tunde', method: DISPATCH },
      // No longer in the cart: ignored
      { sellerId: 'gone', method: DISPATCH },
    ]);
    expect([...methods]).toEqual([
      ['ada', SELLER_PICKUP],
      ['tunde', DISPATCH],
    ]);
  });

  it('needs a choice for every store, and one only', () => {
    expect(
      codeOf(() =>
        chooseMethods(stores, [{ sellerId: 'ada', method: DISPATCH }]),
      ),
    ).toBe('DELIVERY_CHOICE_REQUIRED');
    expect(
      codeOf(() =>
        chooseMethods(stores, [
          { sellerId: 'ada', method: DISPATCH },
          { sellerId: 'ada', method: SELLER_PICKUP },
          { sellerId: 'tunde', method: DISPATCH },
        ]),
      ),
    ).toBe('VALIDATION_FAILED');
  });

  it('refuses pickup from a seller who does not offer it (decision DL1)', () => {
    expect(
      codeOf(() =>
        chooseMethods(stores, [
          { sellerId: 'ada', method: DISPATCH },
          { sellerId: 'tunde', method: SELLER_PICKUP },
        ]),
      ),
    ).toBe('PICKUP_NOT_OFFERED');
  });
});

describe('assertOneDestination', () => {
  it('takes a campus place or an address, not both or neither (decision DF6)', () => {
    expect(codeOf(() => assertOneDestination({ campusPlaceId: 'p1' }))).toBe(
      null,
    );
    expect(
      codeOf(() => assertOneDestination({ address: '14 Akoka Road' })),
    ).toBe(null);
    expect(
      codeOf(() =>
        assertOneDestination({ campusPlaceId: 'p1', address: '14 Akoka Road' }),
      ),
    ).toBe('VALIDATION_FAILED');
    expect(codeOf(() => assertOneDestination(undefined))).toBe(
      'DESTINATION_REQUIRED',
    );
    expect(codeOf(() => assertOneDestination({}))).toBe('DESTINATION_REQUIRED');
  });
});
