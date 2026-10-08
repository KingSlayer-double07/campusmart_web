import { z } from 'zod';

const required = z.string().trim().min(1);

// Validated at startup by ConfigModule.forRoot — the app refuses to boot on a missing or malformed variable.
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  FRONTEND_URL: z.url().default('http://localhost:3000'),
  APP_URL: z.url().default('http://localhost:3000'),

  // Database (Neon Postgres)
  DATABASE_URL: z.url(),
  DIRECT_URL: z.url(),

  // Auth
  JWT_SECRET: required,

  // Cloudinary (image uploads)
  CLOUDINARY_CLOUD_NAME: required,
  CLOUDINARY_API_KEY: required,
  CLOUDINARY_API_SECRET: required,

  // Mail (SMTP)
  MAIL_HOST: required,
  MAIL_PORT: z.coerce.number().int().positive(),
  MAIL_USER: required,
  MAIL_PASS: required,
  MAIL_FROM: required,

  // Resend (transactional email) — TODO(resend): uncomment once we own a verified domain
  // RESEND_API_KEY: required,

  // Paystack (payments)
  PAYSTACK_SECRET_KEY: required,
  PAYSTACK_ENABLED: z.stringbool().default(true),

  // Platform fee in basis points (bps). 100 bps = 1%
  PLATFORM_FEE_BPS: z.coerce.number().int().nonnegative().default(0),

  // Order payment TTL in minutes
  ORDER_PAYMENT_TTL_MINUTES: z.coerce.number().int().positive().default(30),

  // Escrow dispute window in hours
  ESCROW_DISPUTE_WINDOW_HOURS: z.coerce.number().int().positive().default(48),

  // Low stock threshold for listings
  LOW_STOCK_THRESHOLD: z.coerce.number().int().nonnegative().default(3),

  // Seed admin user credentials
  SEED_ADMIN_EMAIL: required,
  SEED_ADMIN_PASSWORD: required,
});

export type Env = z.infer<typeof envSchema>;
