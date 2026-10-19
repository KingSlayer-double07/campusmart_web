import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  Matches,
  registerDecorator,
  ValidationOptions,
} from 'class-validator';

export const WEEKDAYS = [
  'MON',
  'TUE',
  'WED',
  'THU',
  'FRI',
  'SAT',
  'SUN',
] as const;
export type Weekday = (typeof WEEKDAYS)[number];

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface OpeningHours {
  day: Weekday;
  open: string;
  close: string;
}

// One open period per day, in 24-hour time (the PickupStation.openingHours JSON, guide 2.2)
export class OpeningHoursDto implements OpeningHours {
  @ApiProperty({ enum: WEEKDAYS, enumName: 'Weekday' })
  @IsIn(WEEKDAYS, { message: 'day must be MON to SUN' })
  day!: Weekday;

  @ApiProperty({ example: '09:00', description: '24-hour HH:MM' })
  @Matches(HHMM, { message: 'open must be a time such as 09:00' })
  open!: string;

  @ApiProperty({ example: '17:00', description: '24-hour HH:MM, after open' })
  @Matches(HHMM, { message: 'close must be a time such as 17:00' })
  close!: string;
}

// The first rule a set of opening hours breaks, or null. Malformed entries are left to the
// per-field validators above.
export function openingHoursProblem(hours: unknown): string | null {
  if (!Array.isArray(hours)) return null;
  const seen = new Set<unknown>();
  for (const entry of hours as Partial<OpeningHours>[]) {
    if (!entry || typeof entry !== 'object') continue;
    if (seen.has(entry.day)) return `${String(entry.day)} is listed twice`;
    seen.add(entry.day);
    const { open, close } = entry;
    if (
      typeof open === 'string' &&
      typeof close === 'string' &&
      HHMM.test(open) &&
      HHMM.test(close) &&
      close <= open
    ) {
      return `${String(entry.day)}: closing time must be after opening time`;
    }
  }
  return null;
}

export function IsOpeningHours(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'isOpeningHours',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate: (value: unknown) => openingHoursProblem(value) === null,
        defaultMessage: (args) =>
          openingHoursProblem(args?.value) ?? 'Invalid opening hours',
      },
    });
}

export const sortByWeekday = <T extends { day: Weekday }>(hours: T[]) =>
  [...hours].sort((a, b) => WEEKDAYS.indexOf(a.day) - WEEKDAYS.indexOf(b.day));
