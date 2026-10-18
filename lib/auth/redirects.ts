import type { User, UserRole } from '@/lib/api/auth';

// Where each role lands after signing in (guide 1.6.5)
export function homeForRole(role: UserRole | undefined): string {
  switch (role) {
    case 'ADMIN':
      return '/admin';
    case 'PICKUP_AGENT':
      return '/agent';
    case 'DISPATCH':
      return '/dispatch';
    case 'SELLER':
      return '/sellers';
    default:
      return '/';
  }
}

// After sign-in: unverified users finish verification first, and a buyer who signed up without a
// school email picks their school (decision T1); then everyone goes to their home
export function afterSignIn(
  user: Pick<User, 'role' | 'emailVerifiedAt' | 'institutionId'>,
  next?: string | null,
): string {
  if (!user.emailVerifiedAt) return '/onboarding/verify-email';
  if (needsSchool(user)) return '/onboarding/school';
  return safeNext(next) ?? homeForRole(user.role);
}

export const needsSchool = (user: Pick<User, 'role' | 'institutionId'>) =>
  user.role === 'BUYER' && !user.institutionId;

// Only same-origin paths, never protocol-relative or absolute URLs
export function safeNext(next?: string | null): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/onboarding')) {
    return null;
  }
  return next;
}

export function signInPathFor(pathname: string): string {
  return pathname.startsWith('/sellers') ? '/onboarding/sellers/sign-in' : '/onboarding/buyers/sign-in';
}
