import type { CookieOptions, Response } from 'express';
import { REFRESH_TOKEN_TTL_MS } from '../sessions/sessions.service';

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';

// D1/D6: first-party, httpOnly, SameSite=Lax, no Domain attribute, secure in production.
// The refresh cookie is only sent to /api/auth/*.
// The access cookie lasts as long as the session, though the token in it expires after 15 minutes
// (D6, auth.module.ts). The app's route guard (proxy.ts) only sees this cookie, and used to send a
// signed-in user to sign-in whenever the browser had dropped it (staging, 2026-10-19). An expired
// token is refused like a missing one, and the app refreshes it.
function base(path: string): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path,
  };
}

export function setAuthCookies(
  res: Response,
  tokens: { accessToken: string; refreshToken: string },
) {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...base('/'),
    maxAge: REFRESH_TOKEN_TTL_MS,
  });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...base('/api/auth'),
    maxAge: REFRESH_TOKEN_TTL_MS,
  });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie(ACCESS_COOKIE, base('/'));
  res.clearCookie(REFRESH_COOKIE, base('/api/auth'));
}
