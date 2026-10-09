import {
  CODE_ALPHABET,
  collectionCode,
  sellerOrderCode,
  splitFee,
} from './order-codes';

describe('order codes', () => {
  it('makes CM- codes from an alphabet with no 0, O, 1 or I', () => {
    expect(CODE_ALPHABET).not.toMatch(/[0O1I]/);
    expect(CODE_ALPHABET).toHaveLength(32);
    for (let i = 0; i < 200; i += 1) {
      expect(sellerOrderCode()).toMatch(/^CM-[2-9A-HJ-NP-Z]{6}$/);
    }
    // Uses every position of the alphabet the random source gives it
    let n = 0;
    expect(sellerOrderCode(() => n++ % 32)).toBe('CM-234567');
  });

  it('makes 6-digit collection codes, keeping leading zeros', () => {
    expect(collectionCode(() => 42)).toBe('000042');
    expect(collectionCode(() => 999_999)).toBe('999999');
    for (let i = 0; i < 200; i += 1)
      expect(collectionCode()).toMatch(/^\d{6}$/);
  });

  it('takes the platform fee in basis points, rounding down', () => {
    expect(splitFee(1_000_000, 0)).toEqual({
      platformFeeKobo: 0,
      sellerPayoutKobo: 1_000_000,
    });
    expect(splitFee(1_000_000, 500)).toEqual({
      platformFeeKobo: 50_000,
      sellerPayoutKobo: 950_000,
    });
    expect(splitFee(999, 250)).toEqual({
      platformFeeKobo: 24,
      sellerPayoutKobo: 975,
    });
  });
});
