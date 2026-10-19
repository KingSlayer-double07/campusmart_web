import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import nock from 'nock';
import { GoogleOAuthService, GoogleSignInError } from './google-oauth.service';

const config = (values: Record<string, string | undefined>) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService<
    never,
    true
  >;

describe('GoogleOAuthService', () => {
  const service = new GoogleOAuthService(
    config({
      GOOGLE_CLIENT_ID: 'client',
      GOOGLE_CLIENT_SECRET: 'secret',
      APP_URL: 'https://campusmart.test',
    }),
  );

  beforeAll(() => nock.disableNetConnect());
  afterEach(() => nock.cleanAll());
  afterAll(() => nock.enableNetConnect());

  it('is set up only with both the client id and secret', () => {
    expect(service.configured).toBe(true);
    expect(
      new GoogleOAuthService(config({ GOOGLE_CLIENT_ID: 'client' }) as never)
        .configured,
    ).toBe(false);
  });

  it('starts with a fresh state and a PKCE challenge for its verifier', () => {
    const a = service.start();
    const b = service.start();
    expect(a.state).not.toBe(b.state);
    const url = new URL(a.url);
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://campusmart.test/api/auth/google/callback',
    );
    expect(url.searchParams.get('code_challenge')).toBe(
      createHash('sha256').update(a.verifier).digest('base64url'),
    );
  });

  it('reads a verified Google email, lower-cased', async () => {
    nock('https://oauth2.googleapis.com')
      .post('/token')
      .reply(200, { access_token: 't' });
    nock('https://openidconnect.googleapis.com')
      .get('/v1/userinfo')
      .reply(200, {
        sub: 's',
        email: 'Ada@Gmail.com',
        email_verified: true,
        given_name: 'Ada',
      });
    await expect(service.profile('code', 'verifier')).resolves.toEqual({
      sub: 's',
      email: 'ada@gmail.com',
      firstName: 'Ada',
      lastName: null,
    });
  });

  it('refuses an unverified email and a failed exchange', async () => {
    nock('https://oauth2.googleapis.com')
      .post('/token')
      .reply(200, { access_token: 't' });
    nock('https://openidconnect.googleapis.com')
      .get('/v1/userinfo')
      .reply(200, { sub: 's', email: 'a@gmail.com', email_verified: false });
    await expect(service.profile('code', 'v')).rejects.toBeInstanceOf(
      GoogleSignInError,
    );
    nock('https://oauth2.googleapis.com')
      .post('/token')
      .reply(400, { error: 'invalid_grant' });
    await expect(service.profile('code', 'v')).rejects.toBeInstanceOf(
      GoogleSignInError,
    );
  });
});
