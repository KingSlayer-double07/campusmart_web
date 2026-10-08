import type { User, UserRole } from '@/lib/api/auth';

// Where each role lands after signing in (guide 1.6.5)
export function homeForRole(role: UserRole | undefined): string {
  switch (role) {
    case 'ADMIN':
      return '/admin';
    case 'PICKUP_AGENT':
      return '/agent';
    case 'SELLER':
      return '/sellers';
    default:
      return '/';
  }
}

// After sign-in: unverified users finish verification first, then everyone goes to their home
export function afterSignIn(user: Pick<User, 'role' | 'emailVerifiedAt'>, next?: string | null): string {
  if (!user.emailVerifiedAt) return '/onboarding/verify-email';
  return safeNext(next) ?? homeForRole(user.role);
}

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
