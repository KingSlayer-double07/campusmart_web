import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { MailService } from '../src/mail/mail.service';
import {
  client,
  createTestApp,
  createUser,
  nextIp,
  signIn,
  TEST_PASSWORD,
  TestContext,
  truncateAll,
} from './utils';

const PASSWORD = 'Campus2026';

function setCookies(res: request.Response): string[] {
  const raw = res.headers['set-cookie'] as string[] | string | undefined;
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function cookieValue(res: request.Response, name: string) {
  const line = setCookies(res).find((c) => c.startsWith(`${name}=`));
  return line ? decodeURIComponent(line.split(';')[0].split('=')[1]) : '';
}

describe('Phase 1 auth (e2e)', () => {
  let ctx: TestContext;
  let mailSpy: jest.SpyInstance;
  let institutionId: string;

  // The latest code emailed to an address
  const lastCode = (email: string, template = 'verify-email') => {
    const call = [...mailSpy.mock.calls]
      .reverse()
      .find(([to, t]) => to === email && t === template);
    if (!call) throw new Error(`no ${template} email to ${email}`);
    return (call[2] as { code: string }).code;
  };

  const register = (
    email: string,
    accountType: 'BUYER' | 'SELLER' = 'BUYER',
    agent = client(ctx.app),
  ) =>
    agent
      .post('/api/auth/register')
      .send({ email, password: PASSWORD, accountType })
      .then((res) => ({ res, agent }));

  beforeAll(async () => {
    ctx = await createTestApp();
    mailSpy = jest
      .spyOn(ctx.app.get(MailService), 'send')
      .mockResolvedValue(undefined);
  });

  beforeEach(async () => {
    await truncateAll(ctx.prisma);
    mailSpy.mockClear();
    const institution = await ctx.prisma.institution.create({
      data: { name: 'University of Lagos', domains: ['unilag.edu.ng'] },
    });
    institutionId = institution.id;
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  describe('sign-up', () => {
    it('a non-school domain is rejected with 422 INSTITUTION_NOT_SUPPORTED (frontend -> /waitlist)', async () => {
      const { res } = await register('ada@gmail.com');
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('INSTITUTION_NOT_SUPPORTED');
      expect(await ctx.prisma.user.count()).toBe(0);
    });

    it('a school email (sub-domain of a school domain) creates the account, sets both cookies and emails a code', async () => {
      const { res, agent } = await register('ada@students.unilag.edu.ng');
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        email: 'ada@students.unilag.edu.ng',
        role: 'BUYER',
        institutionId,
        emailVerifiedAt: null,
      });
      expect(res.body.data).not.toHaveProperty('password');
      expect(res.body.data).not.toHaveProperty('sessionId');

      const cookies = setCookies(res);
      const access = cookies.find((c) => c.startsWith('access_token='))!;
      const refresh = cookies.find((c) => c.startsWith('refresh_token='))!;
      expect(access).toMatch(/Path=\/;/);
      expect(access).toMatch(/Max-Age=900;/);
      expect(refresh).toMatch(/Path=\/api\/auth;/);
      expect(refresh).toMatch(/Max-Age=2592000;/);
      for (const c of [access, refresh]) {
        expect(c).toMatch(/HttpOnly/);
        expect(c).toMatch(/SameSite=Lax/);
        expect(c).not.toMatch(/Domain=/);
      }

      expect(lastCode('ada@students.unilag.edu.ng')).toMatch(/^\d{6}$/);
      await agent.get('/api/auth/me').expect(200);
    });

    it('a seller account gets the SELLER role', async () => {
      const { res } = await register('shop@unilag.edu.ng', 'SELLER');
      expect(res.status).toBe(201);
      expect(res.body.data.role).toBe('SELLER');
    });

    it('rejects a client-sent institutionId or role (unknown fields)', async () => {
      const res = await client(ctx.app)
        .post('/api/auth/register')
        .send({
          email: 'ada@unilag.edu.ng',
          password: PASSWORD,
          accountType: 'BUYER',
          institutionId,
        })
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('enforces the password policy', async () => {
      const res = await client(ctx.app)
        .post('/api/auth/register')
        .send({
          email: 'ada@unilag.edu.ng',
          password: 'alllowercase1',
          accountType: 'BUYER',
        })
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('rejects a duplicate email with 409', async () => {
      await register('ada@unilag.edu.ng');
      const { res } = await register('ADA@unilag.edu.ng');
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('CONFLICT');
    });
  });

  describe('email verification', () => {
    it('the right code verifies the email', async () => {
      const { agent } = await register('ada@unilag.edu.ng');
      const res = await agent
        .post('/api/auth/verify-email')
        .send({ code: lastCode('ada@unilag.edu.ng') })
        .expect(200);
      expect(res.body.data.emailVerifiedAt).not.toBeNull();
    });

    it('a wrong code 5 times locks that code; a resent code works', async () => {
      const email = 'ada@unilag.edu.ng';
      const { agent } = await register(email);
      const code = lastCode(email);
      const wrong = code === '000000' ? '111111' : '000000';

      for (let i = 1; i <= 4; i++) {
        const res = await agent
          .post('/api/auth/verify-email')
          .set('X-Forwarded-For', nextIp())
          .send({ code: wrong })
          .expect(400);
        expect(res.body).toMatchObject({
          code: 'INVALID_CODE',
          details: { attemptsLeft: 5 - i },
        });
      }
      const fifth = await agent
        .post('/api/auth/verify-email')
        .set('X-Forwarded-For', nextIp())
        .send({ code: wrong })
        .expect(400);
      expect(fifth.body.code).toBe('CODE_LOCKED');

      // Locked: even the right code is refused now
      const locked = await agent
        .post('/api/auth/verify-email')
        .set('X-Forwarded-For', nextIp())
        .send({ code })
        .expect(400);
      expect(locked.body.code).toBe('CODE_LOCKED');

      // Let the 1-a-minute resend window pass
      await ctx.prisma.emailCode.updateMany({
        data: { createdAt: new Date(Date.now() - 2 * 60_000) },
      });
      await agent.post('/api/auth/verify-email/resend').expect(204);
      const fresh = lastCode(email);
      const ok = await agent
        .post('/api/auth/verify-email')
        .send({ code: fresh })
        .expect(200);
      expect(ok.body.data.emailVerifiedAt).not.toBeNull();
    });

    it('resend is limited to 1 a minute', async () => {
      const { agent } = await register('ada@unilag.edu.ng');
      const res = await agent.post('/api/auth/verify-email/resend').expect(429);
      expect(res.body.code).toBe('RATE_LIMITED');
      expect(res.body.details.retryAfterSeconds).toBeGreaterThan(0);
    });

    it('a resent code invalidates the previous one', async () => {
      const email = 'ada@unilag.edu.ng';
      const { agent } = await register(email);
      const first = lastCode(email);
      await ctx.prisma.emailCode.updateMany({
        data: { createdAt: new Date(Date.now() - 2 * 60_000) },
      });
      await agent.post('/api/auth/verify-email/resend').expect(204);
      const second = lastCode(email);
      if (first !== second) {
        const res = await agent
          .post('/api/auth/verify-email')
          .send({ code: first })
          .expect(400);
        expect(res.body.code).toBe('INVALID_CODE');
      }
      await agent
        .post('/api/auth/verify-email')
        .send({ code: second })
        .expect(200);
    });

    it('verify-email needs a signed-in user', async () => {
      await client(ctx.app)
        .post('/api/auth/verify-email')
        .send({ code: '123456' })
        .expect(401);
    });
  });

  describe('refresh and sessions', () => {
    it('after the access cookie expires (15 minutes idle), refresh restores access silently', async () => {
      const user = await createUser(ctx.prisma);
      const agent = await signIn(ctx.app, user.email);
      const login = await ctx.prisma.session.findFirstOrThrow({
        where: { userId: user.id },
      });

      // A 15-minute-old access token: its exp has passed
      const jwt = ctx.app.get(JwtService);
      const expired = jwt.sign(
        { sub: user.id, sid: login.id, role: user.role },
        { expiresIn: -1 },
      );
      await request(ctx.app.getHttpServer())
        .get('/api/auth/me')
        .set('Cookie', `access_token=${expired}`)
        .expect(401);

      // The browser drops the cookie at Max-Age; the client then calls refresh once
      const res = await agent.post('/api/auth/refresh').expect(204);
      expect(cookieValue(res, 'access_token')).not.toBe('');
      expect(cookieValue(res, 'refresh_token')).toMatch(/^[0-9a-f-]{36}\./);
      await agent.get('/api/auth/me').expect(200);
    });

    it('a reused old refresh token revokes its session', async () => {
      const user = await createUser(ctx.prisma);
      const ip = nextIp();
      const loginRes = await request(ctx.app.getHttpServer())
        .post('/api/auth/login')
        .set('X-Forwarded-For', ip)
        .send({ email: user.email, password: TEST_PASSWORD })
        .expect(200);
      const r1 = cookieValue(loginRes, 'refresh_token');
      const sid = r1.split('.')[0];

      const rotated = await request(ctx.app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', `refresh_token=${r1}`)
        .expect(204);
      const r2 = cookieValue(rotated, 'refresh_token');
      const a2 = cookieValue(rotated, 'access_token');
      expect(r2).not.toBe(r1);
      expect(r2.split('.')[0]).toBe(sid);

      // Replay the old token: 401, and the session is revoked
      const replay = await request(ctx.app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', `refresh_token=${r1}`)
        .expect(401);
      expect(setCookies(replay).join(';')).toMatch(/refresh_token=;/);
      const session = await ctx.prisma.session.findUniqueOrThrow({
        where: { id: sid },
      });
      expect(session.revokedAt).not.toBeNull();

      // Everything issued from that session is dead too
      await request(ctx.app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', `refresh_token=${r2}`)
        .expect(401);
      await request(ctx.app.getHttpServer())
        .get('/api/auth/me')
        .set('Cookie', `access_token=${a2}`)
        .expect(401);
    });

    it('logging out on phone A leaves phone B signed in; "sign out other devices" signs B out', async () => {
      const user = await createUser(ctx.prisma);
      const phoneA = await signIn(ctx.app, user.email);
      const phoneB = await signIn(ctx.app, user.email);

      await phoneA.post('/api/auth/logout').expect(204);
      await phoneA.get('/api/auth/me').expect(401);
      await phoneA.post('/api/auth/refresh').expect(401);
      await phoneB.get('/api/auth/me').expect(200);

      // A signs in again and signs every other device out
      const phoneA2 = await signIn(ctx.app, user.email);
      const before = await phoneA2.get('/api/users/me/sessions').expect(200);
      expect(before.body.data).toHaveLength(2);
      expect(
        before.body.data.filter((s: { current: boolean }) => s.current),
      ).toHaveLength(1);

      await phoneA2.delete('/api/users/me/sessions').expect(204);
      await phoneB.get('/api/auth/me').expect(401);
      await phoneB.post('/api/auth/refresh').expect(401);
      await phoneA2.get('/api/auth/me').expect(200);

      const after = await phoneA2.get('/api/users/me/sessions').expect(200);
      expect(after.body.data).toHaveLength(1);
      expect(after.body.data[0].current).toBe(true);
    });

    it('lists only my sessions, with user agent and IP', async () => {
      const me = await createUser(ctx.prisma);
      const other = await createUser(ctx.prisma);
      const agent = client(ctx.app, '102.89.1.10');
      await agent
        .post('/api/auth/login')
        .set('User-Agent', 'CampusMart-Test/1.0')
        .send({ email: me.email, password: TEST_PASSWORD })
        .expect(200);
      await signIn(ctx.app, other.email);

      const res = await agent.get('/api/users/me/sessions').expect(200);
      expect(res.body.data).toEqual([
        {
          id: expect.any(String),
          userAgent: 'CampusMart-Test/1.0',
          ipAddress: '102.89.1.10',
          lastUsedAt: expect.any(String),
          current: true,
        },
      ]);
    });

    it("revoking another user's session is a 404", async () => {
      const me = await createUser(ctx.prisma);
      const other = await createUser(ctx.prisma);
      const mine = await signIn(ctx.app, me.email);
      const theirs = await signIn(ctx.app, other.email);
      const theirSession = await ctx.prisma.session.findFirstOrThrow({
        where: { userId: other.id },
      });

      await mine
        .delete(`/api/users/me/sessions/${theirSession.id}`)
        .expect(404);
      await theirs.get('/api/auth/me').expect(200);
    });

    it('revoking one of my sessions signs that device out', async () => {
      const me = await createUser(ctx.prisma);
      const phoneA = await signIn(ctx.app, me.email);
      const phoneB = await signIn(ctx.app, me.email);
      const list = await phoneA.get('/api/users/me/sessions').expect(200);
      const other = list.body.data.find(
        (s: { current: boolean }) => !s.current,
      );

      await phoneA.delete(`/api/users/me/sessions/${other.id}`).expect(204);
      await phoneB.get('/api/auth/me').expect(401);
      await phoneA.get('/api/auth/me').expect(200);
    });

    it('sessions require sign-in', async () => {
      await client(ctx.app).get('/api/users/me/sessions').expect(401);
    });
  });

  describe('passwords', () => {
    it('changing the password signs out every other session', async () => {
      const user = await createUser(ctx.prisma);
      const phoneA = await signIn(ctx.app, user.email);
      const phoneB = await signIn(ctx.app, user.email);

      await phoneA
        .patch('/api/users/me/password')
        .send({ currentPassword: TEST_PASSWORD, newPassword: 'NewCampus2026' })
        .expect(204);

      await phoneA.get('/api/auth/me').expect(200);
      await phoneB.get('/api/auth/me').expect(401);
      await signIn(ctx.app, user.email, 'NewCampus2026');
    });

    it('forgot-password is always 204; reset with the code revokes every session', async () => {
      const user = await createUser(ctx.prisma);
      const phone = await signIn(ctx.app, user.email);

      await client(ctx.app)
        .post('/api/auth/forgot-password')
        .send({ email: 'ghost@unilag.edu.ng' })
        .expect(204);
      await client(ctx.app)
        .post('/api/auth/forgot-password')
        .send({ email: user.email })
        .expect(204);
      const code = lastCode(user.email, 'reset-password');

      await client(ctx.app)
        .post('/api/auth/reset-password')
        .send({ email: user.email, code, newPassword: 'Reset2026x' })
        .expect(204);

      await phone.get('/api/auth/me').expect(401);
      await client(ctx.app)
        .post('/api/auth/login')
        .send({ email: user.email, password: TEST_PASSWORD })
        .expect(401);
      await signIn(ctx.app, user.email, 'Reset2026x');
    });

    it('reset-password with a wrong code or unknown email gives the same 400 INVALID_CODE', async () => {
      const user = await createUser(ctx.prisma);
      await client(ctx.app)
        .post('/api/auth/forgot-password')
        .send({ email: user.email })
        .expect(204);
      const code = lastCode(user.email, 'reset-password');
      const wrong = code === '000000' ? '111111' : '000000';

      const a = await client(ctx.app)
        .post('/api/auth/reset-password')
        .send({ email: user.email, code: wrong, newPassword: 'Reset2026x' })
        .expect(400);
      const b = await client(ctx.app)
        .post('/api/auth/reset-password')
        .send({
          email: 'ghost@unilag.edu.ng',
          code: wrong,
          newPassword: 'Reset2026x',
        })
        .expect(400);
      expect(a.body.code).toBe('INVALID_CODE');
      expect(b.body.code).toBe(a.body.code);
      expect(b.body.message).toBe(a.body.message);
    });
  });

  describe('suspension', () => {
    it('a suspended user is signed out on the next request', async () => {
      const user = await createUser(ctx.prisma);
      const agent = await signIn(ctx.app, user.email);
      await ctx.prisma.user.update({
        where: { id: user.id },
        data: { isSuspended: true },
      });
      await agent.get('/api/auth/me').expect(401);
      await agent.post('/api/auth/refresh').expect(401);
    });
  });
});
