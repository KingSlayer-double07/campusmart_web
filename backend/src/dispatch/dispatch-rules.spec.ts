import { DeliveryMethod, FulfillmentStatus } from '../generated/prisma/enums';
import {
  buyerDisplayName,
  handoverCodeVisible,
  normaliseOrderCode,
  riderName,
  windowProblem,
} from './dispatch-rules';

describe('dispatch rules', () => {
  it('reads a CM- code however the rider typed it (DX5)', () => {
    for (const typed of [
      'CM-7F3K2Q',
      'cm-7f3k2q',
      ' 7F3K2Q ',
      'cm7f3k2q',
      '7F 3K2Q',
    ]) {
      expect(normaliseOrderCode(typed)).toBe('CM-7F3K2Q');
    }
  });

  it('shows the buyer their code only when it is due (C7)', () => {
    const { DISPATCH, SELLER_PICKUP } = DeliveryMethod;
    expect(
      handoverCodeVisible(DISPATCH, FulfillmentStatus.RIDER_ASSIGNED),
    ).toBe(false);
    expect(handoverCodeVisible(DISPATCH, FulfillmentStatus.WITH_RIDER)).toBe(
      true,
    );
    expect(handoverCodeVisible(DISPATCH, FulfillmentStatus.DELIVERED)).toBe(
      false,
    );
    expect(handoverCodeVisible(SELLER_PICKUP, FulfillmentStatus.PENDING)).toBe(
      false,
    );
    expect(
      handoverCodeVisible(SELLER_PICKUP, FulfillmentStatus.AWAITING_PICKUP),
    ).toBe(true);
    expect(handoverCodeVisible(null, FulfillmentStatus.DROPPED_OFF)).toBe(true);
  });

  it('names people without their contact details (guide 6.2, DX8)', () => {
    expect(buyerDisplayName({ username: 'tobi', firstName: 'Tobi' })).toBe(
      'tobi',
    );
    expect(buyerDisplayName({ username: null, firstName: null })).toBe('Buyer');
    expect(riderName({ firstName: 'Musa', lastName: 'Bello' })).toBe(
      'Musa Bello',
    );
    expect(riderName({ firstName: null, lastName: null })).toBe('Your rider');
  });

  it('checks an arrival window (DF8b)', () => {
    const now = new Date('2026-10-18T09:00:00Z');
    const at = (h: number) => new Date(now.getTime() + h * 3_600_000);
    const deadline = at(72);
    expect(windowProblem(at(1), at(3), deadline, now)).toBeNull();
    expect(windowProblem(at(3), at(1), deadline, now)).toMatch(/end after/);
    expect(windowProblem(at(1), at(6), deadline, now)).toMatch(/4 hours/);
    expect(windowProblem(at(-3), at(-1), deadline, now)).toMatch(/passed/);
    expect(windowProblem(at(73), at(74), deadline, now)).toMatch(/deadline/);
  });
});
