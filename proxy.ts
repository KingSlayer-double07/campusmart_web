import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// UX redirect only (guide 1.6.7); the API enforces every rule. Either auth cookie counts.
// Next.js 16 renamed middleware.ts to proxy.ts (guide Phase 10 clean-ups).
// Note: the refresh cookie is scoped to /api/auth (D6), so page requests normally carry only the
// access cookie. When it has expired, sign-in tries a silent refresh before asking for a password.
// /dispatch/invite stays open: a rider sets their password there before they can sign in
// Decision 2026-10-19: guests browse and fill a cart, and sign in at checkout; store pages need an
// account
export const PROTECTED_PREFIXES = ['/sellers', '/profile', '/admin', '/agent', '/dispatch', '/checkout', '/orders', '/stores'];

// Pages under a protected prefix that a signed-out visitor still needs
const OPEN_PATHS = ['/dispatch/invite'];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (OPEN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  const signedIn = request.cookies.has('access_token') || request.cookies.has('refresh_token');
  if (signedIn) return NextResponse.next();

  const signIn = pathname.startsWith('/sellers') ? '/onboarding/sellers/sign-in' : '/onboarding/buyers/sign-in';
  const url = new URL(signIn, request.url);
  url.searchParams.set('next', `${pathname}${search}`);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    '/sellers/:path*',
    '/profile/:path*',
    '/admin/:path*',
    '/agent/:path*',
    '/dispatch/:path*',
    '/checkout/:path*',
    '/orders/:path*',
    '/stores/:path*',
  ],
};
