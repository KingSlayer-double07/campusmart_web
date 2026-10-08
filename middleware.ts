import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// UX redirect only (guide 1.6.7); the API enforces every rule. Either auth cookie counts.
// Note: the refresh cookie is scoped to /api/auth (D6), so page requests normally carry only the
// access cookie. When it has expired, sign-in tries a silent refresh before asking for a password.
export const PROTECTED_PREFIXES = ['/sellers', '/profile', '/admin', '/agent', '/checkout', '/cart', '/orders'];

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
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
    '/checkout/:path*',
    '/cart/:path*',
    '/orders/:path*',
  ],
};
