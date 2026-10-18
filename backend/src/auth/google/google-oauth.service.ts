import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import type { Env } from '../../config/env';

export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_USERINFO_URL =
  'https://openidconnect.googleapis.com/v1/userinfo';

export interface GoogleProfile {
  sub: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

export class GoogleSignInError extends Error {}

const base64url = (buf: Buffer) => buf.toString('base64url');

// The authorization-code flow with PKCE (guide 10, decisions T1 and G3). The user's details come from
// Google's userinfo endpoint over TLS with the access token, so no ID-token signature check is needed.
@Injectable()
export class GoogleOAuthService {
  private readonly logger = new Logger(GoogleOAuthService.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  get configured(): boolean {
    return !!(
      this.config.get('GOOGLE_CLIENT_ID', { infer: true }) &&
      this.config.get('GOOGLE_CLIENT_SECRET', { infer: true })
    );
  }

  private get redirectUri(): string {
    return (
      this.config.get('GOOGLE_REDIRECT_URI', { infer: true }) ??
      `${this.config.get('APP_URL', { infer: true })}/api/auth/google/callback`
    );
  }

  // A fresh state (against forged callbacks) and PKCE verifier for one sign-in
  start(): { url: string; state: string; verifier: string } {
    const state = base64url(randomBytes(24));
    const verifier = base64url(randomBytes(32));
    const challenge = base64url(createHash('sha256').update(verifier).digest());
    const params = new URLSearchParams({
      client_id: this.config.get('GOOGLE_CLIENT_ID', { infer: true }),
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });
    return { url: `${GOOGLE_AUTH_URL}?${params}`, state, verifier };
  }

  // Swaps the code for tokens, then reads who signed in. Only a verified Google email is accepted.
  async profile(code: string, verifier: string): Promise<GoogleProfile> {
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        code_verifier: verifier,
        client_id: this.config.get('GOOGLE_CLIENT_ID', { infer: true }),
        client_secret: this.config.get('GOOGLE_CLIENT_SECRET', {
          infer: true,
        }),
        redirect_uri: this.redirectUri,
        grant_type: 'authorization_code',
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const tokens = (await tokenRes.json().catch(() => null)) as {
      access_token?: string;
    } | null;
    if (!tokenRes.ok || !tokens?.access_token) {
      this.logger.warn(`Google token exchange failed: ${tokenRes.status}`);
      throw new GoogleSignInError('token exchange failed');
    }

    const infoRes = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      signal: AbortSignal.timeout(10_000),
    });
    const info = (await infoRes.json().catch(() => null)) as {
      sub?: string;
      email?: string;
      email_verified?: boolean;
      given_name?: string;
      family_name?: string;
    } | null;
    if (
      !infoRes.ok ||
      !info?.sub ||
      !info.email ||
      info.email_verified !== true
    ) {
      throw new GoogleSignInError('no verified email');
    }
    return {
      sub: info.sub,
      email: info.email.trim().toLowerCase(),
      firstName: info.given_name?.slice(0, 50) ?? null,
      lastName: info.family_name?.slice(0, 50) ?? null,
    };
  }
}
