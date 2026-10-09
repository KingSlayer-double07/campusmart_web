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
    expect(env.LOW_STOCK_THRESHOLD).toBe(3);
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
});
