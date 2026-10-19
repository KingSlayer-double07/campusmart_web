import { ForbiddenException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
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

type Db = Pick<Prisma.TransactionClient, 'institution'>;

// Cart and checkout (guide 4.1, D9): the buyer must belong to a school that is switched on. An
// access token outlives a switch-off by up to 15 minutes, so this reads the school each time.
export async function requireActiveInstitution(
  db: Db,
  user: { id: string; institutionId: string | null },
): Promise<{ id: string; institutionId: string }> {
  if (!user.institutionId) {
    throw new ForbiddenException({
      code: 'NO_INSTITUTION',
      message: "Your account isn't linked to a school, so it can't shop yet",
    });
  }
  const institution = await db.institution.findUnique({
    where: { id: user.institutionId },
    select: { isActive: true },
  });
  if (!institution?.isActive) throw institutionInactive();
  return { id: user.id, institutionId: user.institutionId };
}
