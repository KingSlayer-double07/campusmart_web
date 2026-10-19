import {
  DeliveryMethod,
  Fault,
  FulfillmentStatus,
} from '../generated/prisma/enums';
import {
  chargeProblem,
  channelsFor,
  enabledMethods,
  fulfilmentOnPayment,
  paymentReference,
  refundAmounts,
} from './payment-rules';

describe('payment rules', () => {
  it('offers OPay and PalmPay only once the wallet channels are switched on (P5)', () => {
    expect(enabledMethods(false)).toEqual(['CARD', 'BANK_TRANSFER']);
    expect(enabledMethods(true)).toEqual([
      'CARD',
      'BANK_TRANSFER',
      'OPAY',
      'PALMPAY',
    ]);
    expect(channelsFor('CARD')).toEqual(['card']);
    expect(channelsFor('BANK_TRANSFER')).toEqual(['bank_transfer']);
    expect(channelsFor('OPAY')).toEqual(['bank_transfer', 'ussd']);
  });

  it('gives each attempt its own reference (P7)', () => {
    expect(paymentReference('o1', 1)).toBe('CM_o1_1');
    expect(paymentReference('o1', 2)).toBe('CM_o1_2');
  });

  it('accepts only a successful NGN charge for exactly the amount asked', () => {
    const ok = { status: 'success', currency: 'NGN', amount: 950_000 };
    expect(chargeProblem(950_000, ok)).toBeNull();
    expect(chargeProblem(950_000, { ...ok, amount: 900_000 })).toMatch(
      /amount 900000/,
    );
    expect(chargeProblem(950_000, { ...ok, currency: 'USD' })).toMatch(/USD/);
    expect(chargeProblem(950_000, { ...ok, status: 'failed' })).toMatch(
      /failed/,
    );
  });

  it('starts the clock for the rider or the buyer when the order is paid', () => {
    const paidAt = new Date('2026-10-17T10:00:00Z');
    const days = { pickupDeadlineDays: 3, buyerCollectDays: 5 };
    expect(fulfilmentOnPayment(DeliveryMethod.DISPATCH, paidAt, days)).toEqual({
      fulfillmentStatus: FulfillmentStatus.AWAITING_RIDER,
      pickupDeadline: new Date('2026-10-20T10:00:00Z'),
      dropOffDeadline: null,
    });
    expect(
      fulfilmentOnPayment(DeliveryMethod.SELLER_PICKUP, paidAt, days),
    ).toMatchObject({
      fulfillmentStatus: FulfillmentStatus.AWAITING_PICKUP,
      pickupDeadline: new Date('2026-10-22T10:00:00Z'),
    });
    expect(fulfilmentOnPayment(null, paidAt, days)).toMatchObject({
      fulfillmentStatus: FulfillmentStatus.AWAITING_DROPOFF,
      dropOffDeadline: new Date('2026-10-20T10:00:00Z'),
    });
  });

  describe('refundAmounts (P6, DF9)', () => {
    const base = {
      itemsKobo: 300_000,
      orderSubtotalKobo: 1_000_000,
      paystackFeesKobo: 16_000,
      deliveryFeeKobo: 0,
    };

    it("keeps back the seller order's share of the Paystack fee when it's the buyer's fault", () => {
      expect(refundAmounts({ ...base, fault: Fault.BUYER })).toEqual({
        itemsKobo: 300_000,
        deliveryFeeKobo: 0,
        paystackFeeKobo: 4_800,
        amountKobo: 295_200,
      });
    });

    it("refunds everything when it's the seller's fault or nobody's", () => {
      for (const fault of [Fault.SELLER, Fault.NONE]) {
        expect(refundAmounts({ ...base, fault })).toMatchObject({
          paystackFeeKobo: 0,
          amountKobo: 300_000,
        });
      }
    });

    it('adds the delivery fee when the caller says it comes back', () => {
      expect(
        refundAmounts({
          ...base,
          fault: Fault.SELLER,
          deliveryFeeKobo: 50_000,
        }),
      ).toMatchObject({ deliveryFeeKobo: 50_000, amountKobo: 350_000 });
    });
  });
});
