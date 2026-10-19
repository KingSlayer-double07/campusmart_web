import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user';
import { institutionInactive } from '../institutions/institution-access';
import type { PrismaService } from '../prisma/prisma.service';

// Who is looking at listings, and at which school. Signed in, it's always their own school.
// A guest names the school they picked (decision 2026-10-19), which must be switched on.
export interface Viewer {
  id: string | null;
  institutionId: string | null;
}

export async function resolveViewer(
  prisma: PrismaService,
  user: AuthUser | undefined,
  institutionId?: string,
): Promise<Viewer> {
  if (user) return { id: user.id, institutionId: user.institutionId };
  // No session and no school: 401, which also makes a signed-in app whose access cookie has
  // just expired refresh it (the app only sends a school while signed out)
  if (!institutionId) {
    throw new UnauthorizedException({
      code: 'UNAUTHENTICATED',
      message: 'Sign in, or choose a school to browse',
    });
  }
  const school = await prisma.institution.findUnique({
    where: { id: institutionId },
    select: { isActive: true },
  });
  if (!school) throw new NotFoundException('School not found');
  if (!school.isActive) throw institutionInactive();
  return { id: null, institutionId };
}
