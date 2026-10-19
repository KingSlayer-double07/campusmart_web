import { MailService } from '../src/mail/mail.service';
import { UserRole } from '../src/generated/prisma/enums';
import { createListing, createSchool, createSeller } from './commerce-fixtures';
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

// Phase 10: buyers without a school email (T1), choosing and changing school (G1, G4) and becoming a
// seller with a school email (G2)
describe('Phase 10 accounts (e2e)', () => {
  let ctx: TestContext;
  let mailSpy: jest.SpyInstance;

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

  const lastCode = (to: string, template: string) => {
    const call = [...mailSpy.mock.calls]
      .reverse()
      .find((c) => c[0] === to && c[1] === template);
    return (call?.[2] as { code: string } | undefined)?.code;
  };

  // Signs up and confirms the email with the code, as the app does
  async function signUp(
    email: string,
    accountType: 'BUYER' | 'SELLER' = 'BUYER',
  ) {
    const agent = client(ctx.app);
    const res = await agent
      .post('/api/auth/register')
      .send({ email, password: PASSWORD, accountType });
    if (res.status !== 201) return { agent, res };
    await agent
      .post('/api/auth/verify-email')
      .send({ code: lastCode(email, 'verify-email') })
      .expect(200);
    return { agent, res };
  }

  describe('signing up without a school email (T1, C4)', () => {
    it('a buyer signs up with any email, confirms it, and then picks their school', async () => {
      const school = await createSchool(ctx.prisma);
      const seller = await createSeller(ctx.prisma, school.id);
      await createListing(ctx.prisma, seller);
      const { agent, res } = await signUp('ada@gmail.com');
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        role: 'BUYER',
        institutionId: null,
        schoolEmail: null,
      });

      // No school yet: nothing to browse, and the cart says why
      const browse = await agent.get('/api/listings').expect(200);
      expect(browse.body.data.items).toEqual([]);
      const cart = await agent
        .put('/api/cart/items')
        .send({ listingId: 'x', quantity: 1 });
      expect([400, 403]).toContain(cart.status);

      const picked = await agent
        .patch('/api/users/me/institution')
        .send({ institutionId: school.id })
        .expect(200);
      expect(picked.body.data.institutionId).toBe(school.id);
      const after = await agent.get('/api/listings').expect(200);
      expect(after.body.data.items).toHaveLength(1);
    });

    it('a seller still needs a school email (D7)', async () => {
      await createSchool(ctx.prisma);
      const { res } = await signUp('ada@gmail.com', 'SELLER');
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('INSTITUTION_NOT_SUPPORTED');
    });

    it('a school email still finds its school, and is the confirmed school email', async () => {
      const school = await createSchool(ctx.prisma);
      const email = `ada@${school.domains[0]}`;
      const { agent } = await signUp(email);
      const me = await agent.get('/api/auth/me').expect(200);
      expect(me.body.data).toMatchObject({
        institutionId: school.id,
        schoolEmail: email,
      });
    });

    it('a switched-off school or an unknown one can’t be picked', async () => {
      const off = await createSchool(ctx.prisma, false);
      const { agent } = await signUp('ada@gmail.com');
      const res = await agent
        .patch('/api/users/me/institution')
        .send({ institutionId: off.id })
        .expect(403);
      expect(res.body.code).toBe('INSTITUTION_INACTIVE');
      await agent
        .patch('/api/users/me/institution')
        .send({ institutionId: '00000000-0000-4000-8000-000000000000' })
        .expect(404);
      await agent
        .patch('/api/users/me/institution')
        .send({ institutionId: off.id, extra: 1 })
        .expect(400);
      await client(ctx.app)
        .patch('/api/users/me/institution')
        .send({ institutionId: off.id })
        .expect(401);
    });
  });

  describe('changing school (G1)', () => {
    it('empties the cart', async () => {
      const a = await createSchool(ctx.prisma);
      const b = await createSchool(ctx.prisma);
      const seller = await createSeller(ctx.prisma, a.id);
      const listing = await createListing(ctx.prisma, seller);
      const buyer = await createUser(ctx.prisma, { institutionId: a.id });
      const agent = await signIn(ctx.app, buyer.email);
      await agent
        .put('/api/cart/items')
        .send({ listingId: listing.id, quantity: 1 })
        .expect(200);
      await agent
        .patch('/api/users/me/institution')
        .send({ institutionId: b.id })
        .expect(200);
      const cart = await agent.get('/api/cart').expect(200);
      expect(cart.body.data.items ?? cart.body.data.stores ?? []).toHaveLength(
        0,
      );
      await expect(
        ctx.prisma.cartItem.count({ where: { userId: buyer.id } }),
      ).resolves.toBe(0);
    });

    it('is for buyers only: a seller’s school comes from their school email', async () => {
      const a = await createSchool(ctx.prisma);
      const b = await createSchool(ctx.prisma);
      const seller = await createSeller(ctx.prisma, a.id);
      const agent = await signIn(ctx.app, seller.email);
      await agent
        .patch('/api/users/me/institution')
        .send({ institutionId: b.id })
        .expect(403);
    });
  });

  describe('becoming a seller (G2)', () => {
    it('a buyer without a school email confirms one with a code and becomes a seller there', async () => {
      const school = await createSchool(ctx.prisma);
      const { agent } = await signUp('ada@gmail.com');
      const schoolEmail = `ada.obi@${school.domains[0]}`;

      const direct = await agent
        .post('/api/users/me/become-seller')
        .expect(400);
      expect(direct.body.code).toBe('SCHOOL_EMAIL_REQUIRED');

      await agent
        .post('/api/users/me/school-email')
        .send({ email: schoolEmail.toUpperCase() })
        .expect(204);
      const code = lastCode(schoolEmail, 'school-email');
      expect(code).toMatch(/^\d{6}$/);

      const wrong = await agent
        .post('/api/users/me/school-email/verify')
        .send({ code: code === '000000' ? '111111' : '000000' })
        .expect(400);
      expect(wrong.body.code).toBe('INVALID_CODE');

      const res = await agent
        .post('/api/users/me/school-email/verify')
        .send({ code })
        .expect(200);
      expect(res.body.data).toMatchObject({
        role: 'SELLER',
        institutionId: school.id,
        schoolEmail,
        email: 'ada@gmail.com',
      });
      // The store exists, and the seller still needs ID verification to publish
      await agent.get('/api/sellers/me').expect(200);
      const user = await ctx.prisma.user.findUniqueOrThrow({
        where: { email: 'ada@gmail.com' },
      });
      await expect(
        ctx.prisma.auditLog.count({
          where: {
            entityId: user.id,
            action: 'BECAME_SELLER',
            actorId: user.id,
          },
        }),
      ).resolves.toBe(1);
    });

    it('a buyer who signed up with a school email becomes a seller in one step', async () => {
      const school = await createSchool(ctx.prisma);
      const { agent } = await signUp(`kemi@${school.domains[0]}`);
      const res = await agent.post('/api/users/me/become-seller').expect(200);
      expect(res.body.data).toMatchObject({
        role: 'SELLER',
        institutionId: school.id,
      });
      // Only buyers become sellers
      await agent.post('/api/users/me/become-seller').expect(403);
    });

    it('refuses a non-school email, one another account uses, and an unconfirmed account', async () => {
      const school = await createSchool(ctx.prisma);
      const taken = `taken@${school.domains[0]}`;
      await createUser(ctx.prisma, { email: taken, institutionId: school.id });
      const { agent } = await signUp('ada@gmail.com');

      const notSchool = await agent
        .post('/api/users/me/school-email')
        .send({ email: 'ada@yahoo.com' })
        .expect(422);
      expect(notSchool.body.code).toBe('INSTITUTION_NOT_SUPPORTED');
      const used = await agent
        .post('/api/users/me/school-email')
        .send({ email: taken })
        .expect(409);
      expect(used.body.code).toBe('EMAIL_TAKEN');

      const fresh = client(ctx.app);
      await fresh
        .post('/api/auth/register')
        .send({
          email: 'new@gmail.com',
          password: PASSWORD,
          accountType: 'BUYER',
        })
        .expect(201);
      const unconfirmed = await fresh
        .post('/api/users/me/school-email')
        .send({ email: `new@${school.domains[0]}` })
        .expect(403);
      expect(unconfirmed.body.code).toBe('EMAIL_NOT_VERIFIED');
    });

    it('a school email someone added to sell can’t be used to sign up again', async () => {
      const school = await createSchool(ctx.prisma);
      const { agent } = await signUp('ada@gmail.com');
      const schoolEmail = `ada.obi@${school.domains[0]}`;
      await agent
        .post('/api/users/me/school-email')
        .send({ email: schoolEmail })
        .expect(204);
      await agent
        .post('/api/users/me/school-email/verify')
        .send({ code: lastCode(schoolEmail, 'school-email') })
        .expect(200);
      const again = await client(ctx.app)
        .post('/api/auth/register')
        .send({ email: schoolEmail, password: PASSWORD, accountType: 'SELLER' })
        .expect(409);
      expect(again.body.code).toBe('CONFLICT');
      expect(
        await ctx.prisma.user.count({ where: { role: UserRole.SELLER } }),
      ).toBe(1);
    });
  });
});
