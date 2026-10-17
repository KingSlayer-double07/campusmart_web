import {
  changePct,
  conversionPct,
  daysOf,
  lagosDay,
  rangeWindows,
  stockAlerts,
} from './analytics-rules';

describe('analytics rules', () => {
  it('counts days on the Lagos clock', () => {
    // 23:30 UTC is already the next day in Lagos (UTC+1)
    expect(lagosDay(new Date('2026-10-17T23:30:00Z'))).toBe('2026-10-18');
    expect(lagosDay(new Date('2026-10-17T22:59:59Z'))).toBe('2026-10-17');
  });

  it('a 7-day range is today and the 6 days before, compared with the 7 before that', () => {
    const { current, previous } = rangeWindows(
      '7d',
      new Date('2026-10-17T12:00:00Z'),
    );
    expect(current).toEqual({
      firstDay: '2026-10-11',
      lastDay: '2026-10-17',
      from: new Date('2026-10-10T23:00:00Z'),
      to: new Date('2026-10-17T23:00:00Z'),
    });
    expect(previous).toEqual({
      firstDay: '2026-10-04',
      lastDay: '2026-10-10',
      from: new Date('2026-10-03T23:00:00Z'),
      to: new Date('2026-10-10T23:00:00Z'),
    });
    expect(daysOf(current)).toEqual([
      '2026-10-11',
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
    ]);
  });

  it('30 and 90 days cross month ends', () => {
    const now = new Date('2026-03-01T08:00:00Z');
    expect(daysOf(rangeWindows('30d', now).current)).toHaveLength(30);
    expect(rangeWindows('30d', now).current.firstDay).toBe('2026-01-31');
    expect(rangeWindows('90d', now).previous.lastDay).toBe('2025-12-01');
  });

  it('change is null when there was nothing before, and rounded to one decimal', () => {
    expect(changePct(5, 0)).toBeNull();
    expect(changePct(0, 4)).toBe(-100);
    expect(changePct(15, 12)).toBe(25);
    expect(changePct(2, 3)).toBe(-33.3);
  });

  it('conversion is units per view', () => {
    expect(conversionPct(3, 0)).toBeNull();
    expect(conversionPct(3, 40)).toBe(7.5);
  });

  it('lists options running low, or the listing itself when it has none; out of stock first', () => {
    const alerts = stockAlerts(
      [
        {
          id: 'pants',
          title: 'Cargo pants',
          stock: 12,
          imageUrl: 'p.jpg',
          variants: [
            { id: 'm', label: 'M', stock: 2 },
            { id: 'l', label: 'L', stock: 10 },
          ],
        },
        {
          id: 'lamp',
          title: 'Desk lamp',
          stock: 0,
          imageUrl: null,
          variants: [],
        },
        {
          id: 'kettle',
          title: 'Kettle',
          stock: 5,
          imageUrl: null,
          variants: [],
        },
        { id: 'mug', title: 'Mug', stock: 6, imageUrl: null, variants: [] },
      ],
      5,
    );
    expect(alerts.map((a) => [a.listingId, a.variantLabel, a.stock])).toEqual([
      ['lamp', null, 0],
      ['pants', 'M', 2],
      ['kettle', null, 5],
    ]);
    expect(alerts[1]).toMatchObject({ variantId: 'm', imageUrl: 'p.jpg' });
  });
});
