import request from 'supertest';
import { MailService } from '../src/mail/mail.service';
import { UserRole } from '../src/generated/prisma/enums';
import * as fx from './commerce-fixtures';
import {
  client,
  createTestApp,
  createUser,
  resetRateLimits,
  signIn,
  TestContext,
  truncateAll,
} from './utils';

const PASSWORD = 'Campus2026';

describe('Phase 6 dispatch and handover (e2e)', () => {
  let ctx: TestContext;
  let mailSpy: jest.SpyInstance;

  // The token in the latest invite emailed to an address
  const inviteToken = (email: string) => {
    const call = [...mailSpy.mock.calls]
      .reverse()
      .find(([to, t]) => to === email && t === 'rider-invite');
    if (!call) throw new Error(`no invite email to ${email}`);
    return new URL((call[2] as { link: string }).link).searchParams.get(
      'token',
    )!;
  };

  const adminAgent = async () => {
    const admin = await createUser(ctx.prisma, { role: UserRole.ADMIN });
    return signIn(ctx.app, admin.email);
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    mailSpy = jest
      .spyOn(ctx.app.get(MailService), 'send')
      .mockResolvedValue(undefined);
  });

  beforeEach(async () => {
    await truncateAll(ctx.prisma);
    resetRateLimits(ctx.app);
    mailSpy.mockClear();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  describe('riders (decisions DX1, DX7)', () => {
    const invite = (
      agent: Awaited<ReturnType<typeof signIn>>,
      institutionId: string,
      email = 'musa.rider@gmail.com',
    ) =>
      agent
        .post('/api/admin/riders')
        .send({ email, institutionId, firstName: 'Musa', lastName: 'Bello' });

    it('an admin invites a rider, who sets a password from the link and is signed in', async () => {
      const school = await fx.createSchool(ctx.prisma);
      const admin = await adminAgent();
      const res = await invite(admin, school.id).expect(201);
      expect(res.body.data).toMatchObject({
        email: 'musa.rider@gmail.com',
        firstName: 'Musa',
        isActive: true,
        invitePending: true,
        institution: { id: school.id },
        activeJobs: 0,
      });
      const token = inviteToken('musa.rider@gmail.com');
      await expect(
        ctx.prisma.auditLog.count({ where: { action: 'RIDER_INVITED' } }),
      ).resolves.toBe(1);

      // The page greets them; the token is stored only as a hash
      const info = await client(ctx.app)
        .get(`/api/auth/invites/${token}`)
        .expect(200);
      expect(info.body.data).toEqual({
        email: 'musa.rider@gmail.com',
        firstName: 'Musa',
        institutionName: school.name,
      });
      await expect(
        ctx.prisma.invite.count({ where: { tokenHash: token } }),
      ).resolves.toBe(0);

      const rider = request.agent(ctx.app.getHttpServer());
      const accepted = await rider
        .post('/api/auth/accept-invite')
        .send({ token, password: PASSWORD })
        .expect(200);
      expect(accepted.body.data).toMatchObject({ role: 'DISPATCH' });
      expect(accepted.body.data.emailVerifiedAt).not.toBeNull();
      await rider.get('/api/auth/me').expect(200);

      // The link works once
      await client(ctx.app)
        .post('/api/auth/accept-invite')
        .send({ token, password: PASSWORD })
        .expect(400)
        .expect(({ body }) => expect(body.code).toBe('INVALID_INVITE'));
      await client(ctx.app).get(`/api/auth/invites/${token}`).expect(404);

      // And they can sign in with the password from now on
      await signIn(ctx.app, 'musa.rider@gmail.com', PASSWORD);
    });

    it("riders can't buy: the cart, checkout and orders answer 403 RIDERS_CANNOT_BUY", async () => {
      const school = await fx.createSchool(ctx.prisma);
      const rider = await createUser(ctx.prisma, {
        role: UserRole.DISPATCH,
        institutionId: school.id,
      });
      const agent = await signIn(ctx.app, rider.email);
      for (const res of [
        await agent.get('/api/cart'),
        await agent.post('/api/orders/checkout').send({}),
        await agent.get('/api/orders'),
      ]) {
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('RIDERS_CANNOT_BUY');
      }
      // ...and can't sell (seller routes are SELLER only)
      await agent.get('/api/sellers/me').expect(403);
    });

    it('a resent invite replaces the old link; a taken email is refused; only admins invite', async () => {
      const school = await fx.createSchool(ctx.prisma);
      const admin = await adminAgent();
      const { id } = (await invite(admin, school.id).expect(201)).body.data;
      const first = inviteToken('musa.rider@gmail.com');
      await admin.post(`/api/admin/riders/${id}/resend-invite`).expect(200);
      const second = inviteToken('musa.rider@gmail.com');
      expect(second).not.toBe(first);
      await client(ctx.app).get(`/api/auth/invites/${first}`).expect(404);
      await client(ctx.app).get(`/api/auth/invites/${second}`).expect(200);

      const buyer = await createUser(ctx.prisma, { email: 'ada@gmail.com' });
      await invite(admin, school.id, buyer.email)
        .expect(409)
        .expect(({ body }) => expect(body.code).toBe('EMAIL_TAKEN'));
      await invite(admin, '00000000-0000-4000-8000-000000000000', 'x@y.com')
        .expect(400)
        .expect(({ body }) => expect(body.code).toBe('INVALID_REFERENCE'));
      await invite(admin, school.id, 'x@y.com')
        .send({ email: 'x@y.com', institutionId: school.id, extra: 1 })
        .expect(400);

      const seller = await createUser(ctx.prisma, { role: UserRole.SELLER });
      const sellerAgent = await signIn(ctx.app, seller.email);
      await invite(sellerAgent, school.id, 'z@y.com').expect(403);
    });

    it('switching a rider off needs a reason, ends their sessions and stops sign-in', async () => {
      const school = await fx.createSchool(ctx.prisma);
      const admin = await adminAgent();
      const rider = await createUser(ctx.prisma, {
        role: UserRole.DISPATCH,
        institutionId: school.id,
      });
      const riderAgent = await signIn(ctx.app, rider.email);

      await admin
        .patch(`/api/admin/riders/${rider.id}`)
        .send({ isActive: false })
        .expect(400);
      const off = await admin
        .patch(`/api/admin/riders/${rider.id}`)
        .send({ isActive: false, reason: 'Left the team' })
        .expect(200);
      expect(off.body.data.isActive).toBe(false);
      await riderAgent.post('/api/auth/refresh').expect(401);
      await client(ctx.app)
        .post('/api/auth/login')
        .send({ email: rider.email, password: 'Password123' })
        .expect(401);

      const list = await admin
        .get(`/api/admin/riders?status=INACTIVE&institutionId=${school.id}`)
        .expect(200);
      expect(list.body.data.items.map((r: { id: string }) => r.id)).toEqual([
        rider.id,
      ]);
      await expect(
        ctx.prisma.auditLog.findFirstOrThrow({
          where: { action: 'RIDER_DEACTIVATED' },
        }),
      ).resolves.toMatchObject({ meta: { reason: 'Left the team' } });
    });
  });
});
