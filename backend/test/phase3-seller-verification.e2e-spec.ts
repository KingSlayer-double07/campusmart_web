import { UserRole, VerificationStatus } from '../src/generated/prisma/enums';
import {
  createTestApp,
  createUser,
  resetRateLimits,
  signIn,
  TestContext,
  truncateAll,
} from './utils';

const CLOUD = process.env.CLOUDINARY_CLOUD_NAME!;

// What Cloudinary returns for a private (authenticated) upload
const idPhoto = (userId: string, name = 'card') =>
  `https://res.cloudinary.com/${CLOUD}/image/authenticated/s--Ab12Cd34--/v1700000000/campusmart/verification/${userId}/${name}.jpg`;

const draftBody = (sellerId: string, status = 'DRAFT') => ({
  title: 'Desk lamp',
  description: '',
  priceKobo: 450_000,
  stock: 2,
  category: 'TECH',
  condition: 'USED_GOOD',
  images: [
    {
      url: `https://res.cloudinary.com/${CLOUD}/image/upload/v1/campusmart/listings/${sellerId}/lamp.jpg`,
      publicId: `campusmart/listings/${sellerId}/lamp`,
    },
  ],
  status,
});

// Product rule (decided 2026-10-09): sellers save drafts freely; publishing waits for an admin
// to verify their student ID (guide 9.1 seller verification, 9.2.5).
describe('Seller verification (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    await truncateAll(ctx.prisma);
    resetRateLimits(ctx.app);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  async function people() {
    const school = await ctx.prisma.institution.create({
      data: { name: 'University of Lagos', domains: ['unilag.edu.ng'] },
    });
    const seller = await createUser(ctx.prisma, {
      role: UserRole.SELLER,
      institutionId: school.id,
    });
    await ctx.prisma.sellerProfile.create({
      data: { userId: seller.id, storeName: 'Amaka Styles' },
    });
    const buyer = await createUser(ctx.prisma, { institutionId: school.id });
    const admin = await createUser(ctx.prisma, {
      role: UserRole.ADMIN,
      institutionId: school.id,
    });
    return { school, seller, buyer, admin };
  }

  it('an unverified seller can save drafts but not publish', async () => {
    const { seller } = await people();
    const agent = await signIn(ctx.app, seller.email);

    const live = await agent
      .post('/api/listings')
      .send(draftBody(seller.id, 'ACTIVE'))
      .expect(403);
    expect(live.body.code).toBe('SELLER_NOT_VERIFIED');
    expect(live.body.message).toMatch(/save drafts/);

    const draft = await agent
      .post('/api/listings')
      .send(draftBody(seller.id))
      .expect(201);
    expect(draft.body.data.status).toBe('DRAFT');

    const publish = await agent
      .patch(`/api/listings/${draft.body.data.id}/status`)
      .send({ status: 'ACTIVE' })
      .expect(403);
    expect(publish.body.code).toBe('SELLER_NOT_VERIFIED');
    // Editing a draft is fine
    await agent
      .patch(`/api/listings/${draft.body.data.id}`)
      .send({ title: 'Desk lamp, warm white' })
      .expect(200);
  });

  it('a seller sends their student ID once; buyers cannot', async () => {
    const { seller, buyer } = await people();
    const agent = await signIn(ctx.app, seller.email);

    const before = await agent.get('/api/users/me/verification').expect(200);
    expect(before.body.data).toEqual({
      status: 'UNVERIFIED',
      latestRequest: null,
    });

    // Only a private upload in the seller's own verification folder counts
    for (const documentUrl of [
      'https://example.com/card.jpg',
      `https://res.cloudinary.com/${CLOUD}/image/upload/v1/campusmart/verification/${seller.id}/card.jpg`,
      `https://res.cloudinary.com/${CLOUD}/image/authenticated/v1/campusmart/listings/${seller.id}/card.jpg`,
      idPhoto(buyer.id),
      `https://res.cloudinary.com/someone-else/image/authenticated/v1/campusmart/verification/${seller.id}/card.jpg`,
    ]) {
      const res = await agent
        .post('/api/users/me/verify')
        .send({ documentUrl })
        .expect(400);
      expect(res.body.code).toBe('INVALID_DOCUMENT');
    }
    await agent
      .post('/api/users/me/verify')
      .send({ documentUrl: idPhoto(seller.id), extra: true })
      .expect(400);

    const sent = await agent
      .post('/api/users/me/verify')
      .send({ documentUrl: idPhoto(seller.id) })
      .expect(201);
    expect(sent.body.data).toMatchObject({
      status: 'PENDING',
      latestRequest: { status: 'PENDING', reviewNote: null, reviewedAt: null },
    });
    expect(JSON.stringify(sent.body.data)).not.toContain('documentUrl');

    const again = await agent
      .post('/api/users/me/verify')
      .send({ documentUrl: idPhoto(seller.id, 'card2') })
      .expect(409);
    expect(again.body.code).toBe('VERIFICATION_PENDING');
    await expect(ctx.prisma.verificationRequest.count()).resolves.toBe(1);

    const b = await signIn(ctx.app, buyer.email);
    await b
      .post('/api/users/me/verify')
      .send({ documentUrl: idPhoto(buyer.id) })
      .expect(403);
    await b.get('/api/users/me/verification').expect(403);
  });

  it('an admin rejects with a reason the seller sees, then approves a new photo; the seller can publish', async () => {
    const { seller, admin } = await people();
    const s = await signIn(ctx.app, seller.email);
    const draft = await s
      .post('/api/listings')
      .send(draftBody(seller.id))
      .expect(201);
    await s
      .post('/api/users/me/verify')
      .send({ documentUrl: idPhoto(seller.id) })
      .expect(201);

    const a = await signIn(ctx.app, admin.email);
    const queue = await a.get('/api/admin/verification-requests').expect(200);
    expect(queue.body.data.items).toHaveLength(1);
    const [request] = queue.body.data.items;
    expect(request).toMatchObject({
      status: 'PENDING',
      seller: {
        id: seller.id,
        email: seller.email,
        storeName: 'Amaka Styles',
        institutionName: 'University of Lagos',
      },
    });
    // A short-lived signed link to the private photo, never the stored URL
    const view = new URL(request.documentViewUrl);
    expect(view.origin + view.pathname).toBe(
      `https://api.cloudinary.com/v1_1/${CLOUD}/image/download`,
    );
    expect(view.searchParams.get('type')).toBe('authenticated');
    expect(view.searchParams.get('public_id')).toBe(
      `campusmart/verification/${seller.id}/card`,
    );
    const expiresAt = Number(view.searchParams.get('expires_at'));
    expect(expiresAt - Date.now() / 1000).toBeGreaterThan(500);
    expect(expiresAt - Date.now() / 1000).toBeLessThanOrEqual(600);
    expect(view.searchParams.get('signature')).toBeTruthy();
    expect(request).not.toHaveProperty('documentUrl');

    // Rejecting needs a note
    const noNote = await a
      .post(`/api/admin/verification-requests/${request.id}/decide`)
      .send({ decision: 'REJECTED' })
      .expect(400);
    expect(noNote.body.code).toBe('VALIDATION_FAILED');
    await a
      .post(`/api/admin/verification-requests/${request.id}/decide`)
      .send({
        decision: 'REJECTED',
        note: 'The photo is blurry. Please retake it.',
      })
      .expect(200);

    const seen = await s.get('/api/users/me/verification').expect(200);
    expect(seen.body.data).toMatchObject({
      status: 'REJECTED',
      latestRequest: {
        status: 'REJECTED',
        reviewNote: 'The photo is blurry. Please retake it.',
      },
    });
    await s
      .patch(`/api/listings/${draft.body.data.id}/status`)
      .send({ status: 'ACTIVE' })
      .expect(403);

    // Deciding twice is refused
    const twice = await a
      .post(`/api/admin/verification-requests/${request.id}/decide`)
      .send({ decision: 'VERIFIED' })
      .expect(409);
    expect(twice.body.code).toBe('VERIFICATION_ALREADY_DECIDED');

    // A new photo goes back in the queue; approving it lets the seller publish
    await s
      .post('/api/users/me/verify')
      .send({ documentUrl: idPhoto(seller.id, 'card2') })
      .expect(201);
    const rejected = await a
      .get('/api/admin/verification-requests?status=REJECTED')
      .expect(200);
    expect(rejected.body.data.items.map((r: { id: string }) => r.id)).toEqual([
      request.id,
    ]);
    const pending = await a.get('/api/admin/verification-requests').expect(200);
    const second = pending.body.data.items[0];
    const approved = await a
      .post(`/api/admin/verification-requests/${second.id}/decide`)
      .send({ decision: 'VERIFIED' })
      .expect(200);
    expect(approved.body.data).toMatchObject({
      status: 'VERIFIED',
      reviewNote: null,
    });

    const after = await s.get('/api/users/me/verification').expect(200);
    expect(after.body.data.status).toBe('VERIFIED');
    const me = await s.get('/api/auth/me').expect(200);
    expect(me.body.data.verificationStatus).toBe('VERIFIED');
    const live = await s
      .patch(`/api/listings/${draft.body.data.id}/status`)
      .send({ status: 'ACTIVE' })
      .expect(200);
    expect(live.body.data.status).toBe('ACTIVE');
    expect(live.body.data.seller.verified).toBe(true);
    const done = await s
      .post('/api/users/me/verify')
      .send({ documentUrl: idPhoto(seller.id, 'card3') })
      .expect(409);
    expect(done.body.code).toBe('ALREADY_VERIFIED');

    // Both decisions are audited with the admin's id and the note
    const audit = await ctx.prisma.auditLog.findMany({
      where: { entityType: 'VerificationRequest' },
      orderBy: { createdAt: 'asc' },
    });
    expect(
      audit.map(({ actorId, action, entityId, meta }) => ({
        actorId,
        action,
        entityId,
        meta,
      })),
    ).toEqual([
      {
        actorId: admin.id,
        action: 'SELLER_VERIFICATION_REJECTED',
        entityId: request.id,
        meta: {
          userId: seller.id,
          note: 'The photo is blurry. Please retake it.',
        },
      },
      {
        actorId: admin.id,
        action: 'SELLER_VERIFIED',
        entityId: second.id,
        meta: { userId: seller.id, note: null },
      },
    ]);
    await expect(
      ctx.prisma.verificationRequest.findUniqueOrThrow({
        where: { id: second.id },
      }),
    ).resolves.toMatchObject({ reviewedById: admin.id });
  });

  it('only admins reach the queue, and an unknown request is 404', async () => {
    const { seller, buyer, admin } = await people();
    for (const user of [seller, buyer]) {
      const agent = await signIn(ctx.app, user.email);
      await agent.get('/api/admin/verification-requests').expect(403);
    }
    const a = await signIn(ctx.app, admin.email);
    await a
      .post(
        '/api/admin/verification-requests/00000000-0000-4000-8000-000000000000/decide',
      )
      .send({ decision: 'VERIFIED' })
      .expect(404);
    await a
      .get('/api/admin/verification-requests?status=UNVERIFIED')
      .expect(400);
  });

  it('a stored URL that is not a private CampusMart upload is never linked', async () => {
    const { seller, admin } = await people();
    await ctx.prisma.verificationRequest.create({
      data: { userId: seller.id, documentUrl: 'https://example.com/old.jpg' },
    });
    await ctx.prisma.user.update({
      where: { id: seller.id },
      data: { verificationStatus: VerificationStatus.PENDING },
    });
    const a = await signIn(ctx.app, admin.email);
    const queue = await a.get('/api/admin/verification-requests').expect(200);
    expect(queue.body.data.items[0].documentViewUrl).toBeNull();
  });
});
