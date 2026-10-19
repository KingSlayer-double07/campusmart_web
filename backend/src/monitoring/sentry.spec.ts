import type { ErrorEvent } from '@sentry/nestjs';
import { scrubEvent, sentryOptions } from './sentry';

describe('sentryOptions', () => {
  it('is off without SENTRY_DSN', () => {
    expect(sentryOptions({})).toBeNull();
    expect(sentryOptions({ SENTRY_DSN: '  ' })).toBeNull();
  });

  it('uses SENTRY_ENVIRONMENT, else NODE_ENV, and never sends personal data', () => {
    const dsn = 'https://key@o0.ingest.sentry.io/0';
    expect(
      sentryOptions({ SENTRY_DSN: dsn, NODE_ENV: 'production' }),
    ).toMatchObject({
      dsn,
      environment: 'production',
      sendDefaultPii: false,
      beforeSend: scrubEvent,
    });
    expect(
      sentryOptions({ SENTRY_DSN: dsn, SENTRY_ENVIRONMENT: 'staging' })
        ?.environment,
    ).toBe('staging');
  });
});

describe('scrubEvent', () => {
  it('drops bodies, cookies, query strings, credential headers and the user', () => {
    const event = scrubEvent({
      type: undefined,
      user: { email: 'ada@students.unilag.edu.ng' },
      request: {
        url: 'https://api.test/api/auth/google/callback?code=secret&state=s',
        method: 'POST',
        data: { password: 'Campus2026' },
        cookies: { access_token: 'jwt' },
        query_string: 'code=secret',
        headers: {
          Authorization: 'Bearer jwt',
          cookie: 'access_token=jwt',
          'x-paystack-signature': 'sig',
          'user-agent': 'Mobile Safari',
        },
      },
    });
    expect(event.user).toBeUndefined();
    expect(event.request).toEqual({
      url: 'https://api.test/api/auth/google/callback',
      method: 'POST',
      headers: { 'user-agent': 'Mobile Safari' },
    });
  });

  it('leaves an event without a request alone', () => {
    const event = { type: undefined, message: 'cron failed' } as ErrorEvent;
    expect(scrubEvent(event)).toEqual({
      type: undefined,
      message: 'cron failed',
    });
  });
});
