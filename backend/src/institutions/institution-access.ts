import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../generated/prisma/enums';

// Product rule (decided 2026-10-09): when an institution is switched off, new sign-ups with its domains are
// blocked and only admins can sign in. Everyone else is cut off on their next token refresh.
export const INSTITUTION_INACTIVE_MESSAGE =
  "CampusMart isn't available at your school right now. Please check back soon.";

export const institutionInactive = () =>
  new ForbiddenException({
    code: 'INSTITUTION_INACTIVE',
    message: INSTITUTION_INACTIVE_MESSAGE,
  });

export function blockedByInstitution(user: {
  role: UserRole;
  institution: { isActive: boolean } | null;
}): boolean {
  return user.role !== UserRole.ADMIN && user.institution?.isActive === false;
}
