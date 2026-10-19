import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { IsCampusMartPassword } from './is-campusmart-password.decorator';

class Probe {
  @IsCampusMartPassword()
  password!: string;
}

const isValid = (password: unknown) =>
  validateSync(plainToInstance(Probe, { password })).length === 0;

describe('IsCampusMartPassword', () => {
  it.each(['Campus2026', 'aB3defgh', 'Very long Passphrase 9'])(
    'accepts %p',
    (password) => expect(isValid(password)).toBe(true),
  );

  it.each([
    ['too short', 'aB3defg'],
    ['no uppercase', 'campus2026'],
    ['no lowercase', 'CAMPUS2026'],
    ['no digit', 'CampusMart'],
    ['not a string', 12345678],
  ])('rejects a password with %s', (_label, password) =>
    expect(isValid(password)).toBe(false),
  );
});
