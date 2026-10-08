import { z } from 'zod';

const required = z.string().trim().min(1);
const optional = required.optional();

// Every variable from the guide's appendix. Validated at startup by ConfigModule.forRoot, so the
// app refuses to boot on a missing or malformed variable instead of failing on first use.
//
// Variables whose feature lands in a later phase are optional until that phase, so local dev and
// CI (which only sets the database, JWT and NODE_ENV) can boot. Mail is required in production.
export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    FRONTEND_URL: z.url().default('http://localhost:3000'), // CORS for Swagger and tools
    APP_URL: z.url().default('http://localhost:3000'), // links in emails, Paystack callback

    // Database (Neon Postgres): pooled for the app, direct for migrations
    DATABASE_URL: z.url(),
    DIRECT_URL: z.url(),

    // Auth
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),

    // Mail (SMTP, D18). In development emails print to the console instead.
    MAIL_HOST: optional,
    MAIL_PORT: z.coerce.number().int().positive().optional(),
    MAIL_USER: optional,
    MAIL_PASS: optional,
    MAIL_FROM: optional,

    // Cloudinary (image uploads), Phase 3
    CLOUDINARY_CLOUD_NAME: optional,
    CLOUDINARY_API_KEY: optional,
    CLOUDINARY_API_SECRET: optional,

    // Paystack (payments), Phase 5. Checkout returns no payment URL while PAYMENTS_ENABLED is false.
    PAYSTACK_SECRET_KEY: optional,
    PAYMENTS_ENABLED: z.stringbool().default(false),

    // Marketplace rules
    PLATFORM_FEE_BPS: z.coerce.number().int().nonnegative().default(0), // 100 bps = 1%
    ORDER_PAYMENT_TTL_MINUTES: z.coerce.number().int().positive().default(30),
    DROP_OFF_DEADLINE_DAYS: z.coerce.number().int().positive().default(3),
    // 0 is allowed so the release cron can be tested without waiting (guide 5, checklist)
    ESCROW_DISPUTE_WINDOW_HOURS: z.coerce
      .number()
      .int()
      .nonnegative()
      .default(48),
    LOW_STOCK_THRESHOLD: z.coerce.number().int().nonnegative().default(3),

    // Seed only (prisma/seed.ts, Phase 2); the API itself never reads them
    SEED_ADMIN_EMAIL: z.email().optional(),
    SEED_ADMIN_PASSWORD: optional,
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production') {
      for (const key of [
        'MAIL_HOST',
        'MAIL_PORT',
        'MAIL_USER',
        'MAIL_PASS',
        'MAIL_FROM',
      ] as const) {
        if (env[key] === undefined) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} is required in production`,
          });
        }
      }
    }
    if (env.PAYMENTS_ENABLED && !env.PAYSTACK_SECRET_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['PAYSTACK_SECRET_KEY'],
        message: 'PAYSTACK_SECRET_KEY is required when PAYMENTS_ENABLED=true',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;
