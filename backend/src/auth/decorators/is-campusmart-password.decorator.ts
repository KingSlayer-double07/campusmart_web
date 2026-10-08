import { applyDecorators } from '@nestjs/common';
import { IsString, Matches } from 'class-validator';

// The one password policy (guide 1.4 rule 2), used by register, reset and change.
// Mirrored on the frontend in lib/validations/auth.ts and app/lib/data.ts (passwordRequirements).
export const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
export const PASSWORD_MESSAGE =
  'Password must be at least 8 characters and include an uppercase letter, a lowercase letter and a number';

export function IsCampusMartPassword() {
  return applyDecorators(
    IsString({ message: PASSWORD_MESSAGE }),
    Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE }),
  );
}
