import { describe, expect, it } from 'vitest';
import {
  CATEGORY_LABELS,
  LISTING_STATUS_LABELS,
  formatNaira,
  formatPriceRange,
  koboToNairaInput,
  nairaToKobo,
} from './labels';

describe('labels', () => {
  it('maps listing statuses to the words sellers see', () => {
    expect(LISTING_STATUS_LABELS).toEqual({
      ACTIVE: 'In stock',
      SOLDOUT: 'Out of stock',
      DRAFT: 'Draft',
      ARCHIVED: 'Archived',
      FLAGGED: 'Under review',
    });
    expect(CATEGORY_LABELS.TECH).toBe('Tech');
  });
});

describe('formatNaira', () => {
  it('formats whole kobo as naira', () => {
    expect(formatNaira(1_450_000)).toBe('₦14,500');
    expect(formatNaira(1_450_050)).toBe('₦14,500.50');
    expect(formatNaira(100)).toBe('₦1');
    expect(formatNaira(0)).toBe('₦0');
  });

  it('shows a range as "From"', () => {
    expect(formatPriceRange(500_000, 700_000)).toBe('From ₦5,000');
    expect(formatPriceRange(500_000, 500_000)).toBe('₦5,000');
  });
});

describe('nairaToKobo', () => {
  it('converts a typed naira price with Math.round(price * 100)', () => {
    expect(nairaToKobo('14500')).toBe(1_450_000);
    expect(nairaToKobo('14,500.5')).toBe(1_450_050);
    expect(nairaToKobo('₦ 0.29')).toBe(29);
    expect(nairaToKobo('19.99')).toBe(1999);
  });

  it('refuses anything that is not an amount', () => {
    expect(nairaToKobo('')).toBeNull();
    expect(nairaToKobo('abc')).toBeNull();
    expect(nairaToKobo('1.234')).toBeNull();
    expect(nairaToKobo('-5')).toBeNull();
  });

  it('round-trips into the input', () => {
    expect(koboToNairaInput(1_450_050)).toBe('14500.5');
  });
});
