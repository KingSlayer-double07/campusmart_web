import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateInstitutionDto, UpdateInstitutionDto } from './institution.dto';
import { openingHoursProblem } from './opening-hours.dto';
import {
  CreatePickupStationDto,
  UpdatePickupStationDto,
} from './pickup-station.dto';

async function errorsOf<T extends object>(
  cls: new () => T,
  body: object,
): Promise<string[]> {
  const errors = await validate(plainToInstance(cls, body), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  const flat = (list: typeof errors): string[] =>
    list.flatMap((e) => [
      ...Object.values(e.constraints ?? {}),
      ...flat(e.children ?? []),
    ]);
  return flat(errors);
}

describe('admin DTOs', () => {
  it('normalises domains: trimmed, lowercased, without a leading @', () => {
    const dto = plainToInstance(CreateInstitutionDto, {
      name: ' UNILAG ',
      domains: [' @Students.UNILAG.edu.ng '],
    });
    expect(dto.name).toBe('UNILAG');
    expect(dto.domains).toEqual(['students.unilag.edu.ng']);
  });

  it('needs at least one well-formed domain', async () => {
    expect(
      await errorsOf(CreateInstitutionDto, { name: 'X Uni', domains: [] }),
    ).toContain('Add at least one email domain');
    expect(
      await errorsOf(CreateInstitutionDto, {
        name: 'X Uni',
        domains: ['unilag'],
      }),
    ).toContain('Each domain must look like unilag.edu.ng');
  });

  it('needs a reason to switch an institution off, but not to switch it on', async () => {
    expect(await errorsOf(UpdateInstitutionDto, { isActive: false })).toContain(
      'Give a reason for switching it off',
    );
    expect(
      await errorsOf(UpdateInstitutionDto, {
        isActive: false,
        reason: 'Term break',
      }),
    ).toEqual([]);
    expect(await errorsOf(UpdateInstitutionDto, { isActive: true })).toEqual(
      [],
    );
  });

  it('rejects malformed opening hours on a station', async () => {
    const station = {
      institutionId: '3f8a1c9e-2b7d-4e5f-8a6b-1c2d3e4f5a6b',
      name: 'Main Gate',
      address: 'Main Gate, University Road',
      contactName: 'Bola Ade',
      contactPhone: '+234 801 234 5678',
    };
    expect(
      await errorsOf(CreatePickupStationDto, {
        ...station,
        openingHours: [{ day: 'MON', open: '9am', close: '17:00' }],
      }),
    ).toContain('open must be a time such as 09:00');
    expect(
      await errorsOf(CreatePickupStationDto, { ...station, openingHours: [] }),
    ).toContain('Open the station on at least one day');
    expect(
      await errorsOf(CreatePickupStationDto, {
        ...station,
        openingHours: [{ day: 'MON', open: '09:00', close: '17:00' }],
      }),
    ).toEqual([]);
  });
});

describe('UpdatePickupStationDto', () => {
  it('validates opening hours on edits too, and refuses a new institution', async () => {
    expect(
      await errorsOf(UpdatePickupStationDto, {
        openingHours: [{ day: 'MON', open: '17:00', close: '09:00' }],
      }),
    ).toContain('MON: closing time must be after opening time');
    expect(
      await errorsOf(UpdatePickupStationDto, {
        institutionId: '3f8a1c9e-2b7d-4e5f-8a6b-1c2d3e4f5a6b',
      }),
    ).toContain('property institutionId should not exist');
    expect(
      await errorsOf(UpdatePickupStationDto, { isActive: false }),
    ).toContain('Give a reason for switching it off');
  });
});

describe('openingHoursProblem', () => {
  it('rejects a day listed twice', () => {
    expect(
      openingHoursProblem([
        { day: 'MON', open: '09:00', close: '12:00' },
        { day: 'MON', open: '13:00', close: '17:00' },
      ]),
    ).toBe('MON is listed twice');
  });

  it('rejects closing at or before opening', () => {
    expect(
      openingHoursProblem([{ day: 'SAT', open: '14:00', close: '10:00' }]),
    ).toBe('SAT: closing time must be after opening time');
    expect(
      openingHoursProblem([{ day: 'SAT', open: '10:00', close: '10:00' }]),
    ).not.toBeNull();
  });

  it('accepts a normal week', () => {
    expect(
      openingHoursProblem([
        { day: 'MON', open: '09:00', close: '17:00' },
        { day: 'SAT', open: '10:00', close: '14:00' },
      ]),
    ).toBeNull();
  });
});
