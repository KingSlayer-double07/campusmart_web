import { envSchema } from './env';

// The minimum the CI workflow provides (guide, Testing section)
const ciEnv = {
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/campusmart_test',
  DIRECT_URL: 'postgresql://postgres:postgres@localhost:5432/campusmart_test',
  JWT_SECRET: 'ci-secret-at-least-32-characters-long',
  NODE_ENV: 'test',
};

const mail = {
  MAIL_HOST: 'smtp.example.com',
  MAIL_PORT: '587',
  MAIL_USER: 'user',
  MAIL_PASS: 'pass',
  MAIL_FROM: 'CampusMart <noreply@example.com>',
};

const cloudinary = {
  CLOUDINARY_CLOUD_NAME: 'campusmart',
  CLOUDINARY_API_KEY: '123456789012345',
  CLOUDINARY_API_SECRET: 'secret',
};

describe('envSchema', () => {
  it('accepts the CI environment and fills in defaults', () => {
    const env = envSchema.parse(ciEnv);
    expect(env.PORT).toBe(4000);
    expect(env.PAYMENTS_ENABLED).toBe(false);
    expect(env.PLATFORM_FEE_BPS).toBe(0);
    expect(env.ORDER_PAYMENT_TTL_MINUTES).toBe(30);
    expect(env.DROP_OFF_DEADLINE_DAYS).toBe(3);
    expect(env.ESCROW_DISPUTE_WINDOW_HOURS).toBe(48);
    expect(env.LOW_STOCK_THRESHOLD).toBe(5);
  });

  it('fails when JWT_SECRET is missing', () => {
    const { JWT_SECRET: _omit, ...rest } = ciEnv;
    const result = envSchema.safeParse(rest);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path[0])).toContain('JWT_SECRET');
  });

  it('fails when JWT_SECRET is shorter than 32 characters', () => {
    expect(envSchema.safeParse({ ...ciEnv, JWT_SECRET: 'short' }).success).toBe(
      false,
    );
  });

  it('fails when DATABASE_URL is missing', () => {
    const { DATABASE_URL: _omit, ...rest } = ciEnv;
    expect(envSchema.safeParse(rest).success).toBe(false);
  });

  it('requires the SMTP and Cloudinary settings in production', () => {
    const result = envSchema.safeParse({ ...ciEnv, NODE_ENV: 'production' });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path[0])).toEqual(
      expect.arrayContaining([
        'MAIL_HOST',
        'MAIL_FROM',
        'CLOUDINARY_CLOUD_NAME',
        'CLOUDINARY_API_SECRET',
      ]),
    );
    expect(
      envSchema.safeParse({
        ...ciEnv,
        ...mail,
        ...cloudinary,
        NODE_ENV: 'production',
      }).success,
    ).toBe(true);
  });

  it('lets a production server print emails instead of sending them', () => {
    const staging = {
      ...ciEnv,
      ...cloudinary,
      NODE_ENV: 'production',
      MAIL_TRANSPORT: 'console',
    };
    expect(envSchema.safeParse(staging).success).toBe(true);
    // Cloudinary is still required
    const { CLOUDINARY_API_SECRET: _omit, ...noCloudinary } = staging;
    expect(
      envSchema.safeParse(noCloudinary).error?.issues.map((i) => i.path[0]),
    ).toEqual(['CLOUDINARY_API_SECRET']);
    expect(
      envSchema.safeParse({ ...staging, MAIL_TRANSPORT: 'sendgrid' }).success,
    ).toBe(false);
  });

  it('requires the SMTP settings wherever MAIL_TRANSPORT=smtp', () => {
    const result = envSchema.safeParse({ ...ciEnv, MAIL_TRANSPORT: 'smtp' });
    expect(result.error?.issues.map((i) => i.path[0])).toEqual([
      'MAIL_HOST',
      'MAIL_PORT',
      'MAIL_USER',
      'MAIL_PASS',
      'MAIL_FROM',
    ]);
    expect(
      envSchema.safeParse({ ...ciEnv, ...mail, MAIL_TRANSPORT: 'smtp' })
        .success,
    ).toBe(true);
  });

  it('trusts one proxy unless TRUST_PROXY_HOPS says otherwise', () => {
    expect(envSchema.parse(ciEnv).TRUST_PROXY_HOPS).toBe(1);
    expect(
      envSchema.parse({ ...ciEnv, TRUST_PROXY_HOPS: '2' }).TRUST_PROXY_HOPS,
    ).toBe(2);
    expect(
      envSchema.safeParse({ ...ciEnv, TRUST_PROXY_HOPS: '-1' }).success,
    ).toBe(false);
  });

  it('boots without Cloudinary outside production', () => {
    expect(envSchema.safeParse(ciEnv).success).toBe(true);
  });

  it('requires PAYSTACK_SECRET_KEY once payments are enabled', () => {
    expect(
      envSchema.safeParse({ ...ciEnv, PAYMENTS_ENABLED: 'true' }).success,
    ).toBe(false);
    expect(
      envSchema.safeParse({
        ...ciEnv,
        PAYMENTS_ENABLED: 'true',
        PAYSTACK_SECRET_KEY: 'sk_test_x',
      }).success,
    ).toBe(true);
  });

  it('allows a 0-hour dispute window for testing the release cron', () => {
    const env = envSchema.parse({ ...ciEnv, ESCROW_DISPUTE_WINDOW_HOURS: '0' });
    expect(env.ESCROW_DISPUTE_WINDOW_HOURS).toBe(0);
  });

  it('keeps Sentry optional and rejects a DSN that is not a URL', () => {
    expect(envSchema.parse(ciEnv).SENTRY_DSN).toBeUndefined();
    expect(() =>
      envSchema.parse({ ...ciEnv, SENTRY_DSN: 'not-a-dsn' }),
    ).toThrow();
  });
});
