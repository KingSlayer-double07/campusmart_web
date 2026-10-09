import { describe, expect, it } from 'vitest';
import { openingHoursError, summarizeOpeningHours } from './openingHours';

const day = (d: string, open = '09:00', close = '17:00') =>
  ({ day: d, open, close }) as Parameters<typeof summarizeOpeningHours>[0][number];

describe('summarizeOpeningHours', () => {
  it('groups consecutive days with the same hours', () => {
    expect(
      summarizeOpeningHours([
        day('MON'),
        day('TUE'),
        day('WED'),
        day('THU'),
        day('FRI'),
        day('SAT', '10:00', '14:00'),
      ]),
    ).toEqual([
      { days: 'Mon–Fri', hours: '09:00–17:00' },
      { days: 'Sat', hours: '10:00–14:00' },
    ]);
  });

  it('starts a new line after a closed day, and sorts Monday first', () => {
    expect(summarizeOpeningHours([day('WED'), day('MON')])).toEqual([
      { days: 'Mon', hours: '09:00–17:00' },
      { days: 'Wed', hours: '09:00–17:00' },
    ]);
  });

  it('is empty when the station is never open', () => {
    expect(summarizeOpeningHours([])).toEqual([]);
  });
});

describe('openingHoursError', () => {
  it('needs at least one open day', () => {
    expect(openingHoursError([])).toBe('Open the station on at least one day');
  });

  it('names the day whose closing time is not after its opening time', () => {
    expect(openingHoursError([day('MON'), day('SAT', '14:00', '10:00')])).toBe(
      'Saturday: closing time must be after opening time',
    );
  });

  it('accepts a normal week', () => {
    expect(openingHoursError([day('MON'), day('FRI')])).toBeNull();
  });
});

describe('opening hours rows', () => {
  it('starts a new station open Monday to Friday, 9 to 5', async () => {
    const { rowsFromHours, hoursFromRows } = await import('./openingHours');
    const hours = hoursFromRows(rowsFromHours(null));
    expect(hours.map((h) => h.day)).toEqual(['MON', 'TUE', 'WED', 'THU', 'FRI']);
    expect(hours[0]).toEqual({ day: 'MON', open: '09:00', close: '17:00' });
  });

  it('round-trips saved hours and keeps closed days out', async () => {
    const { rowsFromHours, hoursFromRows } = await import('./openingHours');
    const saved = [day('MON'), day('SAT', '10:00', '14:00')];
    const rows = rowsFromHours(saved);
    expect(rows.filter((r) => r.isOpen).map((r) => r.day)).toEqual(['MON', 'SAT']);
    expect(hoursFromRows(rows)).toEqual(saved);
  });

  it('flags a row that closes before it opens', async () => {
    const { rowError } = await import('./openingHours');
    expect(rowError({ day: 'MON', isOpen: true, open: '17:00', close: '09:00' })).toBe('Closes before it opens');
    expect(rowError({ day: 'MON', isOpen: false, open: '17:00', close: '09:00' })).toBeNull();
  });
});
