import { isTrusted, trustScore } from './trust-rules';

const weights = { rating: 50, completed: 30, verified: 20, penalty: 10 };
const seller = {
  ratingAvg: 5,
  completed: 10,
  settled: 10,
  verified: true,
  sellerFaults: 0,
};

describe('trust score (guide 8.4, R1, R2)', () => {
  it('is 100 for a verified seller rated 5 who handed over every order', () => {
    expect(trustScore(seller, weights)).toBe(100);
  });

  it('weighs the rating, the share handed over and verification', () => {
    expect(
      trustScore(
        { ...seller, ratingAvg: 4, completed: 3, settled: 4 },
        weights,
      ),
    ).toBe(40 + 22.5 + 20);
    expect(trustScore({ ...seller, verified: false }, weights)).toBe(80);
    // No finished orders yet: nothing for that part
    expect(
      trustScore(
        { ...seller, completed: 0, settled: 0, ratingAvg: 0 },
        weights,
      ),
    ).toBe(20);
  });

  it('takes points off per seller-fault refund, never below 0', () => {
    expect(trustScore({ ...seller, sellerFaults: 2 }, weights)).toBe(80);
    expect(
      trustScore({ ...seller, ratingAvg: 0, sellerFaults: 9 }, weights),
    ).toBe(0);
  });

  it('never passes 100, whatever the weights', () => {
    expect(
      trustScore(seller, {
        rating: 90,
        completed: 90,
        verified: 90,
        penalty: 0,
      }),
    ).toBe(100);
  });

  it('shows "Trusted seller" at 80 or more', () => {
    expect(isTrusted(80)).toBe(true);
    expect(isTrusted(79.9)).toBe(false);
  });
});
