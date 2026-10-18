import { MailService } from '../src/mail/mail.service';
import {
  ListingStatus,
  UserRole,
  VerificationStatus,
} from '../src/generated/prisma/enums';
import { createListing, createSchool, createSeller } from './commerce-fixtures';
import {
  client,
  createTestApp,
  createUser,
  DELIVERY_DETAILS,
  resetRateLimits,
  signIn,
  TEST_PASSWORD,
  TestContext,
  truncateAll,
} from './utils';

// Phase 9 slice C: users and suspension, the admin sign-in code, banned words, listing moderation,
// buyer reports, the audit log and the overview
describe('Phase 9 admin: users, moderation and reports (e2e)', () => {
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

  const signInAdmin = async () => {
    const admin = await createUser(ctx.prisma, { role: UserRole.ADMIN });
    return { admin, agent: await signIn(ctx.app, admin.email) };
  };

  const school = async () => {
    const institution = await createSchool(ctx.prisma);
    const seller = await createSeller(ctx.prisma, institution.id);
    const buyer = await createUser(ctx.prisma, {
      institutionId: institution.id,
    });
    return { institution, seller, buyer };
  };

  const audit = (entityId: string, action?: string) =>
    ctx.prisma.auditLog.findMany({
      where: { entityId, ...(action && { action }) },
      orderBy: { createdAt: 'asc' },
    });

  const photo = (sellerId: string) => ({
    url: `https://res.cloudinary.com/campusmart-test/image/upload/v1700000000/campusmart/listings/${sellerId}/photo1.jpg`,
    publicId: `campusmart/listings/${sellerId}/photo1`,
  });

  const listingBody = (sellerId: string, overrides: object = {}) => ({
    title: 'Reading lamp',
    description: 'Bright LED lamp, barely used',
    priceKobo: 450_000,
    stock: 2,
    category: 'TECH',
    condition: 'USED_GOOD',
    images: [photo(sellerId)],
    status: 'ACTIVE',
    confirmNotProhibited: true,
    ...overrides,
  });

  const lastCode = (to: string) => {
    const call = [...mailSpy.mock.calls]
      .reverse()
      .find((c) => c[0] === to && c[1] === 'admin-sign-in');
    return (call?.[2] as { code: string } | undefined)?.code;
  };

  describe('admin sign-in code (M7)', () => {
    it('an admin’s right password emails a code; the sign-in finishes with it', async () => {
      const admin = await createUser(ctx.prisma, { role: UserRole.ADMIN });
      const agent = client(ctx.app);
      const first = await agent
        .post('/api/auth/login')
        .send({ email: admin.email, password: TEST_PASSWORD })
        .expect(401);
      expect(first.body).toMatchObject({
        code: 'ADMIN_CODE_REQUIRED',
        details: { codeSent: true },
      });
      expect(first.headers['set-cookie']).toBeUndefined();
      const code = lastCode(admin.email);
      expect(code).toMatch(/^\d{6}$/);

      const wrong = await agent
        .post('/api/auth/login')
        .send({
          email: admin.email,
          password: TEST_PASSWORD,
          code: code === '000000' ? '111111' : '000000',
        })
        .expect(401);
      expect(wrong.body).toMatchObject({
        code: 'INVALID_CODE',
        details: { attemptsLeft: 4 },
      });

      const ok = await agent
        .post('/api/auth/login')
        .send({ email: admin.email, password: TEST_PASSWORD, code })
        .expect(200);
      expect(ok.body.data.role).toBe('ADMIN');
      await agent.get('/api/admin/overview').expect(200);

      // Single use
      const again = await client(ctx.app)
        .post('/api/auth/login')
        .send({ email: admin.email, password: TEST_PASSWORD, code })
        .expect(401);
      expect(again.body.code).toBe('CODE_EXPIRED');
    });

    it('a wrong password never sends a code, and other roles need none', async () => {
      const admin = await createUser(ctx.prisma, { role: UserRole.ADMIN });
      await client(ctx.app)
        .post('/api/auth/login')
        .send({ email: admin.email, password: 'WrongPass123' })
        .expect(401);
      expect(lastCode(admin.email)).toBeUndefined();

      const buyer = await createUser(ctx.prisma);
      await client(ctx.app)
        .post('/api/auth/login')
        .send({ email: buyer.email, password: TEST_PASSWORD })
        .expect(200);
      expect(mailSpy).not.toHaveBeenCalled();
    });

    it('asking again within a minute keeps the code already sent', async () => {
      const admin = await createUser(ctx.prisma, { role: UserRole.ADMIN });
      const agent = client(ctx.app);
      const body = { email: admin.email, password: TEST_PASSWORD };
      await agent.post('/api/auth/login').send(body).expect(401);
      const code = lastCode(admin.email);
      const second = await agent.post('/api/auth/login').send(body).expect(401);
      expect(second.body.details).toEqual({ codeSent: false });
      expect(
        mailSpy.mock.calls.filter((c) => c[1] === 'admin-sign-in'),
      ).toHaveLength(1);
      await agent
        .post('/api/auth/login')
        .send({ ...body, code })
        .expect(200);
    });
  });

  describe('users', () => {
    it('lists users with search and filters, newest first', async () => {
      const { agent } = await signInAdmin();
      const { institution, seller } = await school();
      await ctx.prisma.user.update({
        where: { id: seller.id },
        data: { firstName: 'Chidi', lastName: 'Okafor' },
      });

      const bySearch = await agent.get('/api/admin/users?q=chidi').expect(200);
      expect(bySearch.body.data.items).toEqual([
        expect.objectContaining({
          id: seller.id,
          name: 'Chidi Okafor',
          role: 'SELLER',
          institutionName: institution.name,
          isSuspended: false,
        }),
      ]);
      const sellers = await agent
        .get(`/api/admin/users?role=SELLER&institutionId=${institution.id}`)
        .expect(200);
      expect(sellers.body.data.items).toHaveLength(1);

      const page = await agent.get('/api/admin/users?limit=2').expect(200);
      expect(page.body.data.items).toHaveLength(2);
      const next = await agent
        .get(`/api/admin/users?limit=2&cursor=${page.body.data.nextCursor}`)
        .expect(200);
      expect(next.body.data.items).toHaveLength(1);
      expect(next.body.data.nextCursor).toBeNull();

      await agent.get('/api/admin/users?role=OWNER').expect(400);
      await agent.get('/api/admin/users?password=x').expect(400);
    });

    it('an admin makes a signed-up user an admin (M1); they are signed out and it is audited', async () => {
      const { admin, agent } = await signInAdmin();
      const { buyer } = await school();
      const buyerAgent = await signIn(ctx.app, buyer.email);

      const res = await agent
        .patch(`/api/admin/users/${buyer.id}/role`)
        .send({ role: 'ADMIN' })
        .expect(200);
      expect(res.body.data.role).toBe('ADMIN');
      await buyerAgent.get('/api/auth/me').expect(401);
      const [row] = await audit(buyer.id, 'ROLE_CHANGED');
      expect(row).toMatchObject({
        actorId: admin.id,
        meta: { from: 'BUYER', to: 'ADMIN' },
      });
      // The new admin signs in with the emailed code
      const newAdmin = await signIn(ctx.app, buyer.email);
      await newAdmin.get('/api/admin/overview').expect(200);
    });

    it('making a buyer a seller opens their store; a seller who stops selling has listings archived', async () => {
      const { agent } = await signInAdmin();
      const { buyer, seller } = await school();
      await agent
        .patch(`/api/admin/users/${buyer.id}/role`)
        .send({ role: 'SELLER' })
        .expect(200);
      await expect(
        ctx.prisma.sellerProfile.count({ where: { userId: buyer.id } }),
      ).resolves.toBe(1);

      const listing = await createListing(ctx.prisma, seller);
      await agent
        .patch(`/api/admin/users/${seller.id}/role`)
        .send({ role: 'BUYER' })
        .expect(200);
      await expect(
        ctx.prisma.listing.findUnique({ where: { id: listing.id } }),
      ).resolves.toMatchObject({ status: ListingStatus.ARCHIVED });
    });

    it('refuses your own role, a rider’s role, unknown roles and a seller with no school', async () => {
      const { admin, agent } = await signInAdmin();
      const own = await agent
        .patch(`/api/admin/users/${admin.id}/role`)
        .send({ role: 'BUYER' })
        .expect(400);
      expect(own.body.code).toBe('CANNOT_CHANGE_ROLE');

      const rider = await createUser(ctx.prisma, { role: UserRole.DISPATCH });
      const riderRes = await agent
        .patch(`/api/admin/users/${rider.id}/role`)
        .send({ role: 'BUYER' })
        .expect(400);
      expect(riderRes.body.code).toBe('CANNOT_CHANGE_ROLE');

      const loner = await createUser(ctx.prisma);
      await agent
        .patch(`/api/admin/users/${loner.id}/role`)
        .send({ role: 'DISPATCH' })
        .expect(400);
      const noSchool = await agent
        .patch(`/api/admin/users/${loner.id}/role`)
        .send({ role: 'SELLER' })
        .expect(400);
      expect(noSchool.body.code).toBe('NO_INSTITUTION');
      await agent
        .patch(`/api/admin/users/${loner.id}/role`)
        .send({ role: 'ADMIN', extra: true })
        .expect(400);
      await expect(audit(loner.id)).resolves.toHaveLength(0);
    });

    it('suspending signs the user out at once, archives live listings and shows the reason at sign-in (M6)', async () => {
      const { admin, agent } = await signInAdmin();
      const { seller } = await school();
      const live = await createListing(ctx.prisma, seller);
      const draft = await createListing(ctx.prisma, seller, {
        title: 'Draft',
        status: ListingStatus.DRAFT,
      });
      const sellerAgent = await signIn(ctx.app, seller.email);
      await sellerAgent.get('/api/auth/me').expect(200);

      await agent
        .post(`/api/admin/users/${seller.id}/suspend`)
        .send({})
        .expect(400);
      const res = await agent
        .post(`/api/admin/users/${seller.id}/suspend`)
        .send({ reason: 'Sold fake phones' })
        .expect(200);
      expect(res.body.data).toMatchObject({
        isSuspended: true,
        suspendedReason: 'Sold fake phones',
      });

      // Signed out on the very next request, and the refresh fails too
      await sellerAgent.get('/api/auth/me').expect(401);
      await sellerAgent.post('/api/auth/refresh').expect(401);
      await expect(
        ctx.prisma.session.count({
          where: { userId: seller.id, revokedAt: null },
        }),
      ).resolves.toBe(0);
      await expect(
        ctx.prisma.listing.findUnique({ where: { id: live.id } }),
      ).resolves.toMatchObject({ status: ListingStatus.ARCHIVED });
      await expect(
        ctx.prisma.listing.findUnique({ where: { id: draft.id } }),
      ).resolves.toMatchObject({ status: ListingStatus.DRAFT });

      const login = await client(ctx.app)
        .post('/api/auth/login')
        .send({ email: seller.email, password: TEST_PASSWORD })
        .expect(401);
      expect(login.body).toMatchObject({
        code: 'ACCOUNT_SUSPENDED',
        details: { reason: 'Sold fake phones' },
      });
      expect(login.body.message).toContain('Sold fake phones');

      const twice = await agent
        .post(`/api/admin/users/${seller.id}/suspend`)
        .send({ reason: 'Again' })
        .expect(409);
      expect(twice.body.code).toBe('ALREADY_SUSPENDED');

      const [row] = await audit(seller.id, 'USER_SUSPENDED');
      expect(row).toMatchObject({
        actorId: admin.id,
        meta: { reason: 'Sold fake phones', archivedListings: 1 },
      });

      await agent.post(`/api/admin/users/${seller.id}/unsuspend`).expect(200);
      await signIn(ctx.app, seller.email);
      const lifted = await audit(seller.id, 'USER_UNSUSPENDED');
      expect(lifted).toHaveLength(1);
      const again = await agent
        .post(`/api/admin/users/${seller.id}/unsuspend`)
        .expect(409);
      expect(again.body.code).toBe('NOT_SUSPENDED');
    });

    it('an admin can’t suspend themselves or another admin', async () => {
      const { admin, agent } = await signInAdmin();
      const other = await createUser(ctx.prisma, { role: UserRole.ADMIN });
      for (const id of [admin.id, other.id]) {
        const res = await agent
          .post(`/api/admin/users/${id}/suspend`)
          .send({ reason: 'Testing' })
          .expect(400);
        expect(res.body.code).toBe('CANNOT_SUSPEND');
      }
      await agent
        .post(`/api/admin/users/00000000-0000-4000-8000-000000000000/suspend`)
        .send({ reason: 'Nobody' })
        .expect(404);
    });
  });

  describe('banned words and the prohibited-items check (M4a, M4c)', () => {
    it('admins read the starter list and edit it; the change is audited', async () => {
      const { admin, agent } = await signInAdmin();
      const start = await agent
        .get('/api/admin/settings/banned-words')
        .expect(200);
      expect(start.body.data.words).toEqual(
        expect.arrayContaining(['gun', 'cocaine', 'fake id']),
      );
      const saved = await agent
        .put('/api/admin/settings/banned-words')
        .send({ words: ['Gun', '  fake   ID ', 'gun', 'airsoft'] })
        .expect(200);
      expect(saved.body.data.words).toEqual(['airsoft', 'fake id', 'gun']);
      const [row] = await audit('bannedWords', 'SETTING_CHANGED');
      expect(row.actorId).toBe(admin.id);
      expect(row.meta).toMatchObject({
        added: ['airsoft'],
        removed: expect.arrayContaining(['cocaine']),
      });
      await agent
        .put('/api/admin/settings/banned-words')
        .send({ words: ['x'] })
        .expect(400);
    });

    it('publishing needs the prohibited-items confirmation', async () => {
      const { seller } = await school();
      const agent = await signIn(ctx.app, seller.email);
      const res = await agent
        .post('/api/listings')
        .send(listingBody(seller.id, { confirmNotProhibited: undefined }))
        .expect(400);
      expect(res.body.code).toBe('CONFIRM_NOT_PROHIBITED');
      // A draft doesn't, and publishing it later asks once
      const draft = await agent
        .post('/api/listings')
        .send(
          listingBody(seller.id, {
            status: 'DRAFT',
            confirmNotProhibited: undefined,
          }),
        )
        .expect(201);
      const unconfirmed = await agent
        .patch(`/api/listings/${draft.body.data.id}/status`)
        .send({ status: 'ACTIVE' })
        .expect(400);
      expect(unconfirmed.body.code).toBe('CONFIRM_NOT_PROHIBITED');
      await agent
        .patch(`/api/listings/${draft.body.data.id}/status`)
        .send({ status: 'ACTIVE', confirmNotProhibited: true })
        .expect(200);
    });

    it('a listing using a banned word waits for review instead of going live, and admins are told', async () => {
      const { admin } = await signInAdmin();
      const { seller, buyer } = await school();
      const agent = await signIn(ctx.app, seller.email);
      // Whole words only: "begun" isn't "gun"
      const fine = await agent
        .post('/api/listings')
        .send(listingBody(seller.id, { description: 'Barely begun notebook' }))
        .expect(201);
      expect(fine.body.data.status).toBe('ACTIVE');

      const held = await agent
        .post('/api/listings')
        .send(
          listingBody(seller.id, {
            title: 'Toy GUN for display',
            description: 'Plastic',
          }),
        )
        .expect(201);
      expect(held.body.data).toMatchObject({
        status: 'FLAGGED',
        heldForReview: true,
      });
      const buyerAgent = await signIn(ctx.app, buyer.email);
      await buyerAgent.get(`/api/listings/${held.body.data.id}`).expect(404);
      await expect(
        ctx.prisma.notification.findMany({
          where: { userId: admin.id, type: 'LISTING_HELD' },
        }),
      ).resolves.toHaveLength(1);
      await expect(
        ctx.prisma.listing.findUnique({ where: { id: held.body.data.id } }),
      ).resolves.toMatchObject({ heldWords: ['gun'], wentLiveAt: null });

      // A live listing edited to use one goes back for review
      const edited = await agent
        .patch(`/api/listings/${fine.body.data.id}`)
        .send({ description: 'Comes with free ammo' })
        .expect(200);
      expect(edited.body.data).toMatchObject({
        status: 'FLAGGED',
        heldForReview: true,
      });
    });
  });

  describe('listing moderation', () => {
    const heldListing = async (
      seller: { id: string; email: string },
      agentFor = signIn(ctx.app, seller.email),
    ) => {
      const agent = await agentFor;
      const res = await agent
        .post('/api/listings')
        .send(listingBody(seller.id, { title: 'Replica watch' }))
        .expect(201);
      return { agent, id: res.body.data.id as string };
    };

    it('the review queue shows held listings; approving puts one live and tells the seller', async () => {
      const { admin, agent } = await signInAdmin();
      const { seller, buyer } = await school();
      const { id } = await heldListing(seller);
      await createListing(ctx.prisma, seller, { title: 'Normal lamp' });

      const queue = await agent.get('/api/admin/listings').expect(200);
      expect(queue.body.data.items).toEqual([
        expect.objectContaining({
          id,
          heldWords: ['replica'],
          wentLive: false,
          storeName: 'Ada Wears',
          openReports: 0,
        }),
      ]);
      const all = await agent.get('/api/admin/listings?view=ALL').expect(200);
      expect(all.body.data.items).toHaveLength(2);

      const approved = await agent
        .post(`/api/admin/listings/${id}/moderate`)
        .send({ type: 'APPROVE' })
        .expect(200);
      expect(approved.body.data).toMatchObject({
        status: 'ACTIVE',
        heldAt: null,
        heldWords: [],
        wentLive: true,
      });
      const buyerAgent = await signIn(ctx.app, buyer.email);
      await buyerAgent.get(`/api/listings/${id}`).expect(200);
      await expect(
        ctx.prisma.notification.count({
          where: { userId: seller.id, type: 'LISTING_APPROVED' },
        }),
      ).resolves.toBe(1);
      const [row] = await audit(id, 'LISTING_MODERATED');
      expect(row).toMatchObject({
        actorId: admin.id,
        meta: { type: 'APPROVE', from: 'FLAGGED', to: 'ACTIVE' },
      });
      await expect(
        ctx.prisma.moderationAction.count({
          where: { listingId: id, type: 'APPROVE', moderatorId: admin.id },
        }),
      ).resolves.toBe(1);
    });

    it('rejecting needs an M3 reason the seller sees; editing sends it back for review', async () => {
      const { agent } = await signInAdmin();
      const { seller } = await school();
      const { agent: sellerAgent, id } = await heldListing(seller);

      await agent
        .post(`/api/admin/listings/${id}/moderate`)
        .send({ type: 'REJECT' })
        .expect(400);
      await agent
        .post(`/api/admin/listings/${id}/moderate`)
        .send({ type: 'REJECT', reason: 'UGLY' })
        .expect(400);
      const rejected = await agent
        .post(`/api/admin/listings/${id}/moderate`)
        .send({
          type: 'REJECT',
          reason: 'POOR_PHOTOS',
          note: 'The photo is too dark',
        })
        .expect(200);
      expect(rejected.body.data).toMatchObject({
        status: 'FLAGGED',
        moderationReason: 'Poor photos: The photo is too dark',
      });
      const hidden = await agent
        .get('/api/admin/listings?view=HIDDEN')
        .expect(200);
      expect(hidden.body.data.items.map((l: { id: string }) => l.id)).toEqual([
        id,
      ]);
      // Rejecting something held before it went live never suspends (M4f)
      await expect(
        ctx.prisma.user.findUnique({ where: { id: seller.id } }),
      ).resolves.toMatchObject({ isSuspended: false });

      const mine = await sellerAgent.get(`/api/listings/${id}`).expect(200);
      expect(mine.body.data).toMatchObject({
        moderationReason: 'Poor photos: The photo is too dark',
        heldForReview: false,
      });
      await expect(
        ctx.prisma.notification.count({
          where: { userId: seller.id, type: 'LISTING_REJECTED' },
        }),
      ).resolves.toBe(1);

      await sellerAgent
        .patch(`/api/listings/${id}`)
        .send({ title: 'Wrist watch' })
        .expect(200);
      const queue = await agent.get('/api/admin/listings').expect(200);
      expect(queue.body.data.items).toEqual([
        expect.objectContaining({ id, heldWords: [] }),
      ]);
    });

    it('confirming a prohibited item that buyers saw suspends the seller (M4d, M4e)', async () => {
      const { admin, agent } = await signInAdmin();
      const { seller } = await school();
      const listing = await createListing(ctx.prisma, seller, {
        title: 'Codeine syrup',
      });
      const other = await createListing(ctx.prisma, seller, {
        title: 'Desk',
      });
      const sellerAgent = await signIn(ctx.app, seller.email);

      await agent
        .post(`/api/admin/listings/${listing.id}/moderate`)
        .send({ type: 'REJECT', reason: 'PROHIBITED_ITEM' })
        .expect(200);
      const user = await ctx.prisma.user.findUniqueOrThrow({
        where: { id: seller.id },
      });
      expect(user).toMatchObject({
        isSuspended: true,
        suspendedById: admin.id,
        suspendedReason: 'Listed a prohibited item: "Codeine syrup"',
      });
      await sellerAgent.get('/api/auth/me').expect(401);
      await expect(
        ctx.prisma.listing.findUnique({ where: { id: other.id } }),
      ).resolves.toMatchObject({ status: ListingStatus.ARCHIVED });
      const [row] = await audit(seller.id, 'USER_SUSPENDED');
      expect(row.meta).toMatchObject({ automatic: true });

      // Approving a listing of a suspended seller is refused until it's lifted
      const blocked = await agent
        .post(`/api/admin/listings/${listing.id}/moderate`)
        .send({ type: 'APPROVE' })
        .expect(409);
      expect(blocked.body.code).toBe('SELLER_SUSPENDED');
    });

    it('flag and unflag move a visible listing in and out of the queue', async () => {
      const { agent } = await signInAdmin();
      const { seller } = await school();
      const listing = await createListing(ctx.prisma, seller);
      await agent
        .post(`/api/admin/listings/${listing.id}/moderate`)
        .send({ type: 'UNFLAG' })
        .expect(409);
      await agent
        .post(`/api/admin/listings/${listing.id}/moderate`)
        .send({ type: 'FLAG', note: 'Price looks wrong' })
        .expect(200);
      let queue = await agent.get('/api/admin/listings').expect(200);
      expect(queue.body.data.items).toHaveLength(1);
      expect(queue.body.data.items[0].status).toBe('ACTIVE');
      await agent
        .post(`/api/admin/listings/${listing.id}/moderate`)
        .send({ type: 'UNFLAG' })
        .expect(200);
      queue = await agent.get('/api/admin/listings').expect(200);
      expect(queue.body.data.items).toHaveLength(0);
      await expect(
        audit(listing.id, 'LISTING_MODERATED'),
      ).resolves.toHaveLength(2);
      await agent
        .post(`/api/admin/listings/${listing.id}/moderate`)
        .send({ type: 'DELETE' })
        .expect(400);
    });
  });

  describe('buyer reports (M4, M4b)', () => {
    const buyers = async (institutionId: string, n: number) =>
      Promise.all(
        Array.from({ length: n }, () =>
          createUser(ctx.prisma, { institutionId }),
        ),
      );

    it('five different users’ reports send a listing to review; it stays visible', async () => {
      const { admin, agent } = await signInAdmin();
      const { institution, seller } = await school();
      const listing = await createListing(ctx.prisma, seller);
      const reporters = await buyers(institution.id, 5);

      for (const [i, reporter] of reporters.entries()) {
        const res = await (
          await signIn(ctx.app, reporter.email)
        )
          .post(`/api/listings/${listing.id}/report`)
          .send({ reason: 'MISLEADING', details: `Report ${i}` })
          .expect(201);
        expect(res.body.data.hidden).toBe(false);
        const row = await ctx.prisma.listing.findUniqueOrThrow({
          where: { id: listing.id },
        });
        expect(row.isFlagged).toBe(i === 4);
      }
      const queue = await agent.get('/api/admin/listings').expect(200);
      expect(queue.body.data.items).toEqual([
        expect.objectContaining({
          id: listing.id,
          status: 'ACTIVE',
          openReports: 5,
          reportReasons: ['MISLEADING'],
        }),
      ]);
      await expect(
        ctx.prisma.notification.count({
          where: { userId: admin.id, type: 'LISTING_FLAGGED' },
        }),
      ).resolves.toBe(1);

      // Approving closes the reports
      await agent
        .post(`/api/admin/listings/${listing.id}/moderate`)
        .send({ type: 'APPROVE', note: 'Checked with the seller' })
        .expect(200);
      const open = await agent.get('/api/admin/support-reports').expect(200);
      expect(open.body.data.items).toHaveLength(0);
      const closed = await agent
        .get('/api/admin/support-reports?status=CLOSED')
        .expect(200);
      expect(closed.body.data.items).toHaveLength(5);
      expect(closed.body.data.items[0].resolutionNote).toBe(
        'Approved: Checked with the seller',
      );
    });

    it('a prohibited-item report hides the listing at once, pending review', async () => {
      const { agent } = await signInAdmin();
      const { seller, buyer } = await school();
      const listing = await createListing(ctx.prisma, seller);
      const buyerAgent = await signIn(ctx.app, buyer.email);

      const res = await buyerAgent
        .post(`/api/listings/${listing.id}/report`)
        .send({ reason: 'PROHIBITED_ITEM' })
        .expect(201);
      expect(res.body.data.hidden).toBe(true);
      await buyerAgent.get(`/api/listings/${listing.id}`).expect(404);
      const queue = await agent.get('/api/admin/listings').expect(200);
      expect(queue.body.data.items).toEqual([
        expect.objectContaining({
          id: listing.id,
          status: 'FLAGGED',
          isFlagged: true,
          reportReasons: ['PROHIBITED_ITEM'],
        }),
      ]);
      await expect(
        ctx.prisma.notification.count({
          where: { userId: seller.id, type: 'LISTING_HIDDEN' },
        }),
      ).resolves.toBe(1);
      // An admin who finds nothing wrong puts it back
      await agent
        .post(`/api/admin/listings/${listing.id}/moderate`)
        .send({ type: 'APPROVE' })
        .expect(200);
      await buyerAgent.get(`/api/listings/${listing.id}`).expect(200);
    });

    it('one report per user, never on your own listing; unverified and signed-out users can’t report', async () => {
      const { institution, seller, buyer } = await school();
      const listing = await createListing(ctx.prisma, seller);
      const buyerAgent = await signIn(ctx.app, buyer.email);
      await buyerAgent
        .post(`/api/listings/${listing.id}/report`)
        .send({ reason: 'SCAM' })
        .expect(201);
      const twice = await buyerAgent
        .post(`/api/listings/${listing.id}/report`)
        .send({ reason: 'OTHER' })
        .expect(409);
      expect(twice.body.code).toBe('ALREADY_REPORTED');

      const own = await (
        await signIn(ctx.app, seller.email)
      )
        .post(`/api/listings/${listing.id}/report`)
        .send({ reason: 'SCAM' })
        .expect(400);
      expect(own.body.code).toBe('OWN_LISTING');

      await buyerAgent
        .post(`/api/listings/${listing.id}/report`)
        .send({ reason: 'BORING' })
        .expect(400);
      const unverified = await createUser(ctx.prisma, {
        institutionId: institution.id,
        emailVerifiedAt: null,
      });
      const u = await (
        await signIn(ctx.app, unverified.email)
      )
        .post(`/api/listings/${listing.id}/report`)
        .send({ reason: 'SCAM' })
        .expect(403);
      expect(u.body.code).toBe('EMAIL_NOT_VERIFIED');
      await client(ctx.app)
        .post(`/api/listings/${listing.id}/report`)
        .send({ reason: 'SCAM' })
        .expect(401);
      await buyerAgent
        .post(`/api/listings/00000000-0000-4000-8000-000000000000/report`)
        .send({ reason: 'SCAM' })
        .expect(404);
    });

    it('admins close a report with a note, and can reopen it; both are audited', async () => {
      const { admin, agent } = await signInAdmin();
      const { seller, buyer } = await school();
      const listing = await createListing(ctx.prisma, seller);
      const report = await (
        await signIn(ctx.app, buyer.email)
      )
        .post(`/api/listings/${listing.id}/report`)
        .send({ reason: 'COUNTERFEIT', details: 'Logo looks off' })
        .expect(201);
      const id = report.body.data.id as string;

      const open = await agent.get('/api/admin/support-reports').expect(200);
      expect(open.body.data.items).toEqual([
        expect.objectContaining({
          id,
          type: 'LISTING',
          reason: 'COUNTERFEIT',
          message: 'Logo looks off',
          listingTitle: 'Desk lamp',
          reporterEmail: buyer.email,
          status: 'OPEN',
        }),
      ]);
      await agent
        .patch(`/api/admin/support-reports/${id}`)
        .send({ status: 'CLOSED' })
        .expect(400);
      const closed = await agent
        .patch(`/api/admin/support-reports/${id}`)
        .send({ status: 'CLOSED', note: 'Genuine, receipt checked' })
        .expect(200);
      expect(closed.body.data).toMatchObject({
        status: 'CLOSED',
        resolutionNote: 'Genuine, receipt checked',
      });
      await agent
        .patch(`/api/admin/support-reports/${id}`)
        .send({ status: 'CLOSED', note: 'Again' })
        .expect(409);
      await agent
        .patch(`/api/admin/support-reports/${id}`)
        .send({ status: 'OPEN' })
        .expect(200);
      const rows = await audit(id);
      expect(rows.map((r) => [r.action, r.actorId])).toEqual([
        ['REPORT_CLOSED', admin.id],
        ['REPORT_REOPENED', admin.id],
      ]);
    });
  });

  describe('audit log and overview', () => {
    it('lists audit entries newest first with who did it, filtered by entity', async () => {
      const { admin, agent } = await signInAdmin();
      const { seller } = await school();
      await agent
        .post(`/api/admin/users/${seller.id}/suspend`)
        .send({ reason: 'Spam listings' })
        .expect(200);
      await agent.post(`/api/admin/users/${seller.id}/unsuspend`).expect(200);

      const res = await agent
        .get(`/api/admin/audit-log?entityType=User&entityId=${seller.id}`)
        .expect(200);
      expect(res.body.data.items).toEqual([
        expect.objectContaining({
          action: 'USER_UNSUSPENDED',
          actorId: admin.id,
          actorEmail: admin.email,
        }),
        expect.objectContaining({
          action: 'USER_SUSPENDED',
          meta: expect.objectContaining({ reason: 'Spam listings' }),
        }),
      ]);
      const byAction = await agent
        .get('/api/admin/audit-log?action=USER_SUSPENDED')
        .expect(200);
      expect(byAction.body.data.items).toHaveLength(1);
      await agent.get('/api/admin/audit-log?actorId=nope').expect(400);
    });

    it('the overview counts what’s waiting for an admin', async () => {
      const { agent } = await signInAdmin();
      const { institution, seller } = await school();
      await createUser(ctx.prisma, {
        institutionId: institution.id,
        role: UserRole.SELLER,
        verificationStatus: VerificationStatus.PENDING,
      });
      await ctx.prisma.verificationRequest.create({
        data: {
          userId: seller.id,
          documentUrl: 'https://example.com/id.jpg',
          status: VerificationStatus.PENDING,
        },
      });
      const listing = await createListing(ctx.prisma, seller);
      await ctx.prisma.listing.update({
        where: { id: listing.id },
        data: { isFlagged: true },
      });
      const suspended = await createUser(ctx.prisma);
      await ctx.prisma.user.update({
        where: { id: suspended.id },
        data: { isSuspended: true },
      });

      const res = await agent.get('/api/admin/overview').expect(200);
      expect(res.body.data).toEqual({
        users: 5,
        sellers: 2,
        paidOrders7d: 0,
        paidOrders30d: 0,
        gmv30dKobo: 0,
        escrowHeldKobo: 0,
        openDisputes: 0,
        pendingVerifications: 1,
        failedPayouts: 0,
        listingsToReview: 1,
        openReports: 0,
        suspendedUsers: 1,
      });
    });
  });

  it('sellers still publish normally with their delivery details', async () => {
    const { seller } = await school();
    await ctx.prisma.sellerProfile.update({
      where: { userId: seller.id },
      data: DELIVERY_DETAILS,
    });
    const agent = await signIn(ctx.app, seller.email);
    const res = await agent
      .post('/api/listings')
      .send(listingBody(seller.id))
      .expect(201);
    expect(res.body.data).toMatchObject({
      status: 'ACTIVE',
      heldForReview: false,
      moderationReason: null,
    });
  });
});
