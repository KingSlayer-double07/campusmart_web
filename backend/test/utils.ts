import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getStorageToken, ThrottlerStorageService } from '@nestjs/throttler';
import { hash } from 'bcrypt';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { UserRole } from '../src/generated/prisma/enums';
import { PrismaService } from '../src/prisma/prisma.service';

export interface TestContext {
  app: INestApplication<App>;
  prisma: PrismaService;
}

export async function createTestApp(): Promise<TestContext> {
  assertTestDatabase();
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>({
    logger: ['error'],
  });
  configureApp(app);
  await app.init();
  return { app, prisma: app.get(PrismaService) };
}

// e2e suites wipe every table, so never let them near a dev or production database.
export function assertTestDatabase() {
  const url = process.env.DATABASE_URL ?? '';
  let dbName = '';
  try {
    dbName = new URL(url).pathname.replace(/^\//, '');
  } catch {
    // fall through to the error below
  }
  if (!/test/i.test(dbName)) {
    throw new Error(
      `Refusing to run e2e tests against database "${dbName || url}". ` +
        'Point DATABASE_URL at a database whose name contains "test".',
    );
  }
}

export async function truncateAll(prisma: PrismaService) {
  assertTestDatabase();
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}

// Rate limits follow the account (AccountThrottlerGuard), and tests reuse emails, so each test
// starts with an empty in-memory throttler store.
export function resetRateLimits(app: INestApplication<App>) {
  app.get<ThrottlerStorageService>(getStorageToken()).storage.clear();
}

// Each test gets its own client IP (the app trusts one proxy hop), so per-IP rate limits
// from one test never leak into another.
let ipCounter = 0;
export function nextIp() {
  ipCounter += 1;
  return `10.${(ipCounter >> 16) & 255}.${(ipCounter >> 8) & 255}.${ipCounter & 255}`;
}

// A cookie-keeping client that always sends the same X-Forwarded-For.
export function client(app: INestApplication<App>, ip = nextIp()) {
  const agent = request.agent(app.getHttpServer());
  agent.set('X-Forwarded-For', ip);
  return agent;
}

export const TEST_PASSWORD = 'Password123';

export async function createUser(
  prisma: PrismaService,
  overrides: {
    email?: string;
    role?: UserRole;
    password?: string;
    institutionId?: string | null;
    emailVerifiedAt?: Date | null;
  } = {},
) {
  ipCounter += 1;
  return prisma.user.create({
    data: {
      email: overrides.email ?? `user${ipCounter}@unilag.edu.ng`,
      password: await hash(overrides.password ?? TEST_PASSWORD, 4),
      role: overrides.role ?? UserRole.BUYER,
      firstName: 'Test',
      lastName: 'User',
      institutionId: overrides.institutionId ?? null,
      emailVerifiedAt:
        overrides.emailVerifiedAt === undefined
          ? new Date()
          : overrides.emailVerifiedAt,
    },
  });
}

export async function signIn(
  app: INestApplication<App>,
  email: string,
  password = TEST_PASSWORD,
) {
  const agent = client(app);
  await agent.post('/api/auth/login').send({ email, password }).expect(200);
  return agent;
}
