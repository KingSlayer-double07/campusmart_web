import request from 'supertest';
import { DeliveryMethod, UserRole } from '../src/generated/prisma/enums';
import { MailService } from '../src/mail/mail.service';
import { PaymentsService } from '../src/payments/payments.service';
import * as fx from './commerce-fixtures';
import {
  client,
  createTestApp,
  createUser,
  DELIVERY_DETAILS,
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
  describe('delivery jobs and handover (DF7, DF8, DX2, DX5, DL5, F5)', () => {
    type Agent = Awaited<ReturnType<typeof signIn>>;
    const hour = 3_600_000;

    async function world() {
      const school = await fx.createSchool(ctx.prisma);
      const other = await fx.createSchool(ctx.prisma);
      const place = await fx.createCampusPlace(ctx.prisma, school.id);
      const ada = await fx.createSeller(ctx.prisma, school.id, 'Ada Wears', {
        allowsPickup: true,
      });
      const tunde = await fx.createSeller(ctx.prisma, school.id, 'Tunde Tech');
      const buyer = await createUser(ctx.prisma, {
        institutionId: school.id,
      });
      const rider = (institutionId: string) =>
        createUser(ctx.prisma, { role: UserRole.DISPATCH, institutionId });
      const musa = await rider(school.id);
      const bola = await rider(school.id);
      const farAway = await rider(other.id);
      // Admin alerts go to every active admin (P10)
      const admin = await createUser(ctx.prisma, { role: UserRole.ADMIN });
      return { school, place, ada, tunde, buyer, musa, bola, farAway, admin };
    }

    // Pays through the real webhook handler, so the job opens as it does in production
    async function paidOrder(
      w: Awaited<ReturnType<typeof world>>,
      methods: { ada?: DeliveryMethod; tunde?: DeliveryMethod },
    ) {
      const stores = [
        ...(methods.ada ? [{ seller: w.ada, method: methods.ada }] : []),
        ...(methods.tunde ? [{ seller: w.tunde, method: methods.tunde }] : []),
      ];
      const order = await fx.createUnpaidOrder(ctx.prisma, w.buyer, stores, {
        campusPlaceId: w.place.id,
      });
      await ctx.app
        .get(PaymentsService)
        .handleEvent(fx.chargeSuccess(order.reference, order.totalKobo));
      const sellerOrders = await ctx.prisma.sellerOrder.findMany({
        where: { orderId: order.id },
        orderBy: { createdAt: 'asc' },
      });
      const job = await ctx.prisma.deliveryJob.findUnique({
        where: { orderId: order.id },
      });
      const of = (sellerId: string) =>
        sellerOrders.find((so) => so.sellerId === sellerId)!;
      return { order, job, of };
    }

    const windowFor = (sellerOrderId: string, startsIn = hour) => ({
      sellerOrderId,
      from: new Date(Date.now() + startsIn).toISOString(),
      to: new Date(Date.now() + startsIn + 2 * hour).toISOString(),
    });

    const accept = (agent: Agent, jobId: string, ids: string[]) =>
      agent
        .post(`/api/dispatch/jobs/${jobId}/accept`)
        .send({ windows: ids.map((id) => windowFor(id)) });

    it('paying for an order with two dispatch stores opens one job; the rider collects from both and delivers once', async () => {
      const w = await world();
      const { order, job, of } = await paidOrder(w, {
        ada: DeliveryMethod.DISPATCH,
        tunde: DeliveryMethod.DISPATCH,
      });
      expect(job).toMatchObject({ status: 'OPEN', institutionId: w.school.id });
      await expect(ctx.prisma.deliveryJob.count()).resolves.toBe(1);
      // Every rider at the campus hears about it (DX2); not the one elsewhere
      const told = await ctx.prisma.notification.findMany({
        where: { type: 'NEW_JOB' },
        select: { userId: true },
      });
      expect(told.map((n) => n.userId).sort()).toEqual(
        [w.musa.id, w.bola.id].sort(),
      );

      const musa = await signIn(ctx.app, w.musa.email);
      const bola = await signIn(ctx.app, w.bola.email);
      // Before accepting: the two areas only (C6)
      const open = (await musa.get('/api/dispatch/jobs').expect(200)).body.data;
      expect(open.items).toHaveLength(1);
      expect(open.items[0]).toMatchObject({
        id: job!.id,
        mine: false,
        buyer: null,
        destination: { campusPlace: 'Faculty of Science', address: null },
      });
      for (const stop of open.items[0].stops) {
        expect(stop).toMatchObject({
          storeName: null,
          address: null,
          phone: null,
          area: DELIVERY_DETAILS.pickupArea,
          items: [],
          itemCount: 1,
        });
      }
      expect(JSON.stringify(open)).not.toContain(
        DELIVERY_DETAILS.pickupAddress,
      );
      expect(JSON.stringify(open)).not.toContain('234 801 234 5678');

      // Two riders accept at once: one wins (DX2)
      const ids = [of(w.ada.id).id, of(w.tunde.id).id];
      const results = await Promise.all([
        accept(musa, job!.id, ids),
        accept(bola, job!.id, ids),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(results.find((r) => r.status === 409)!.body.code).toBe(
        'JOB_TAKEN',
      );
      const winner = results[0].status === 200 ? musa : bola;
      const loser = winner === musa ? bola : musa;
      await loser.get(`/api/dispatch/jobs/${job!.id}`).expect(404);

      const mine = (
        await winner.get(`/api/dispatch/jobs/${job!.id}`).expect(200)
      ).body.data;
      expect(mine).toMatchObject({
        mine: true,
        status: 'ASSIGNED',
        buyer: { phone: '+234 801 234 5678' },
      });
      expect(
        mine.stops.map((s: { storeName: string }) => s.storeName).sort(),
      ).toEqual(['Ada Wears', 'Tunde Tech']);
      expect(mine.stops[0]).toMatchObject({
        status: 'RIDER_ASSIGNED',
        address: DELIVERY_DETAILS.pickupAddress,
      });

      // Sellers see the rider's name and when they're coming; the buyer sees the name, no code yet
      const adaAgent = await signIn(ctx.app, w.ada.email);
      const adaOrders = (
        await adaAgent.get('/api/sellers/me/orders').expect(200)
      ).body.data.items;
      expect(adaOrders).toHaveLength(1);
      expect(adaOrders[0]).toMatchObject({
        code: of(w.ada.id).code,
        fulfillmentStatus: 'RIDER_ASSIGNED',
        rider: { name: 'Test User' },
        canCancel: true,
      });
      expect(adaOrders[0].arrivalFrom).not.toBeNull();
      expect(JSON.stringify(adaOrders)).not.toContain(w.buyer.email);
      const buyerAgent = await signIn(ctx.app, w.buyer.email);
      const before = (
        await buyerAgent.get(`/api/orders/${order.id}`).expect(200)
      ).body.data;
      for (const so of before.sellerOrders) {
        expect(so).toMatchObject({
          collectionCode: null,
          rider: { name: 'Test User' },
        });
      }

      // At Ada's: a wrong code is refused, the right one (any case, no prefix) works (DX5)
      await winner
        .post(`/api/dispatch/jobs/${job!.id}/pickups`)
        .send({ code: 'CM-ZZZZZZ' })
        .expect(400)
        .expect(({ body }) => expect(body.code).toBe('WRONG_CODE'));
      await winner
        .post(`/api/dispatch/jobs/${job!.id}/pickups`)
        .send({ code: of(w.ada.id).code.slice(3).toLowerCase() })
        .expect(200);
      // The buyer now sees Ada's code, not Tunde's (C7)
      const during = (
        await buyerAgent.get(`/api/orders/${order.id}`).expect(200)
      ).body.data.sellerOrders;
      const codeOf = (sellerId: string) =>
        during.find(
          (so: { seller: { id: string } }) => so.seller.id === sellerId,
        ).collectionCode;
      expect(codeOf(w.ada.id)).toBe(of(w.ada.id).collectionCode);
      expect(codeOf(w.tunde.id)).toBeNull();

      // Tunde isn't ready (DF11); the rider comes back later
      await winner
        .post(
          `/api/dispatch/jobs/${job!.id}/stops/${of(w.tunde.id).id}/not-ready`,
        )
        .send({ note: 'Shop closed' })
        .expect(200);
      await expect(
        ctx.prisma.notification.count({
          where: { userId: w.tunde.id, type: 'STORE_NOT_READY' },
        }),
      ).resolves.toBe(1);
      await winner
        .post(`/api/dispatch/jobs/${job!.id}/pickups`)
        .send({ code: of(w.tunde.id).code })
        .expect(200);

      // At the buyer: one code per store (DL5)
      const wrong = await winner
        .post(`/api/dispatch/jobs/${job!.id}/handovers`)
        .send({
          sellerOrderId: of(w.ada.id).id,
          code: of(w.ada.id).collectionCode === '000' ? '001' : '000',
        })
        .expect(400);
      expect(wrong.body).toMatchObject({
        code: 'WRONG_CODE',
        details: { triesLeft: 4 },
      });
      for (const id of ids) {
        const so = id === of(w.ada.id).id ? of(w.ada.id) : of(w.tunde.id);
        await winner
          .post(`/api/dispatch/jobs/${job!.id}/handovers`)
          .send({ sellerOrderId: id, code: so.collectionCode })
          .expect(200);
      }
      const done = await ctx.prisma.sellerOrder.findMany({
        where: { orderId: order.id },
      });
      for (const so of done) {
        expect(so.fulfillmentStatus).toBe('DELIVERED');
        expect(so.releaseAt!.getTime() - so.collectedAt!.getTime()).toBe(
          48 * hour,
        );
      }
      await expect(
        ctx.prisma.deliveryJob.findUniqueOrThrow({ where: { id: job!.id } }),
      ).resolves.toMatchObject({ status: 'DONE' });
    });

    it('riders see only their campus; sellers and riders keep to their own routes; windows are checked', async () => {
      const w = await world();
      const { job, of } = await paidOrder(w, {
        tunde: DeliveryMethod.DISPATCH,
      });
      const far = await signIn(ctx.app, w.farAway.email);
      await far.get(`/api/dispatch/jobs/${job!.id}`).expect(404);
      expect(
        (await far.get('/api/dispatch/jobs').expect(200)).body.data.items,
      ).toEqual([]);
      await accept(far, job!.id, [of(w.tunde.id).id]).expect(404);

      const seller = await signIn(ctx.app, w.tunde.email);
      await seller.get('/api/dispatch/jobs').expect(403);
      const musa = await signIn(ctx.app, w.musa.email);
      await musa.get('/api/sellers/me/orders').expect(403);

      await musa
        .post(`/api/dispatch/jobs/${job!.id}/accept`)
        .send({ windows: [] })
        .expect(400);
      const backwards = windowFor(of(w.tunde.id).id);
      await musa
        .post(`/api/dispatch/jobs/${job!.id}/accept`)
        .send({ windows: [{ ...backwards, to: backwards.from }] })
        .expect(400);
      const tooLate = windowFor(of(w.tunde.id).id, 4 * 24 * hour);
      await musa
        .post(`/api/dispatch/jobs/${job!.id}/accept`)
        .send({ windows: [tooLate] })
        .expect(400);
      await accept(musa, job!.id, [of(w.tunde.id).id]).expect(200);
      // Picking up before accepting is refused for anyone else
      const bola = await signIn(ctx.app, w.bola.email);
      await bola
        .post(`/api/dispatch/jobs/${job!.id}/pickups`)
        .send({ code: of(w.tunde.id).code })
        .expect(404);
    });

    it('5 wrong buyer codes lock the order; an admin unlocks it with a reason', async () => {
      const w = await world();
      const { job, of } = await paidOrder(w, {
        tunde: DeliveryMethod.DISPATCH,
      });
      const so = of(w.tunde.id);
      const musa = await signIn(ctx.app, w.musa.email);
      await accept(musa, job!.id, [so.id]).expect(200);
      await musa
        .post(`/api/dispatch/jobs/${job!.id}/pickups`)
        .send({ code: so.code })
        .expect(200);
      const wrongCode = so.collectionCode === '999' ? '998' : '999';
      const hand = (code: string) =>
        musa
          .post(`/api/dispatch/jobs/${job!.id}/handovers`)
          .send({ sellerOrderId: so.id, code });
      for (let i = 0; i < 4; i += 1) await hand(wrongCode).expect(400);
      await hand(wrongCode)
        .expect(423)
        .expect(({ body }) => expect(body.code).toBe('HANDOVER_LOCKED'));
      // Even the right code waits for an admin now
      await hand(so.collectionCode).expect(423);
      await expect(
        ctx.prisma.notification.count({ where: { type: 'HANDOVER_LOCKED' } }),
      ).resolves.toBeGreaterThan(0);

      const admin = await signIn(ctx.app, w.admin.email);
      const locked = (
        await admin.get('/api/admin/locked-handovers').expect(200)
      ).body.data.items;
      expect(locked).toEqual([
        expect.objectContaining({ sellerOrderId: so.id, code: so.code }),
      ]);
      await admin
        .post(`/api/admin/seller-orders/${so.id}/unlock`)
        .send({})
        .expect(400);
      await admin
        .post(`/api/admin/seller-orders/${so.id}/unlock`)
        .send({ reason: 'Checked the buyer’s ID' })
        .expect(200);
      await admin
        .post(`/api/admin/seller-orders/${so.id}/unlock`)
        .send({ reason: 'Again' })
        .expect(409);
      await hand(so.collectionCode).expect(200);
      await expect(
        ctx.prisma.auditLog.findFirstOrThrow({
          where: { action: 'HANDOVER_UNLOCKED' },
        }),
      ).resolves.toMatchObject({ meta: { reason: 'Checked the buyer’s ID' } });
    });

    it('a rider can give a job back until they carry a parcel; admins can assign or reassign it (C5)', async () => {
      const w = await world();
      const { job, of } = await paidOrder(w, {
        tunde: DeliveryMethod.DISPATCH,
      });
      const so = of(w.tunde.id);
      const musa = await signIn(ctx.app, w.musa.email);
      await accept(musa, job!.id, [so.id]).expect(200);
      await musa.post(`/api/dispatch/jobs/${job!.id}/drop`).expect(200);
      await expect(
        ctx.prisma.sellerOrder.findUniqueOrThrow({ where: { id: so.id } }),
      ).resolves.toMatchObject({
        fulfillmentStatus: 'AWAITING_RIDER',
        arrivalFrom: null,
      });
      await expect(
        ctx.prisma.notification.count({ where: { type: 'JOB_DROPPED' } }),
      ).resolves.toBeGreaterThan(0);

      await accept(musa, job!.id, [so.id]).expect(200);
      await musa
        .post(`/api/dispatch/jobs/${job!.id}/pickups`)
        .send({ code: so.code })
        .expect(200);
      await musa
        .post(`/api/dispatch/jobs/${job!.id}/drop`)
        .expect(409)
        .expect(({ body }) => expect(body.code).toBe('PARCELS_WITH_RIDER'));

      const admin = await signIn(ctx.app, w.admin.email);
      await admin
        .post(`/api/admin/deliveries/${job!.id}/assign`)
        .send({ riderId: w.farAway.id })
        .expect(400)
        .expect(({ body }) => expect(body.code).toBe('INVALID_RIDER'));
      const assigned = await admin
        .post(`/api/admin/deliveries/${job!.id}/assign`)
        .send({ riderId: w.bola.id, reason: 'Musa is ill' })
        .expect(200);
      expect(assigned.body.data.rider).toMatchObject({ id: w.bola.id });
      await expect(
        ctx.prisma.auditLog.findFirstOrThrow({
          where: { action: 'JOB_ASSIGNED' },
        }),
      ).resolves.toMatchObject({
        actorId: expect.any(String),
        meta: { from: w.musa.id, to: w.bola.id, reason: 'Musa is ill' },
      });
      await musa.get(`/api/dispatch/jobs/${job!.id}`).expect(404);
      const active = (
        await admin.get('/api/admin/deliveries?view=ACTIVE').expect(200)
      ).body.data.items;
      expect(active.map((j: { id: string }) => j.id)).toEqual([job!.id]);
      // A seller can't reach the admin routes
      const seller = await signIn(ctx.app, w.tunde.email);
      await seller.get('/api/admin/deliveries').expect(403);
    });

    it('pickup from the seller: the seller enters the buyer’s code; a seller cancels before pickup and the buyer is refunded', async () => {
      const w = await world();
      const { order, job, of } = await paidOrder(w, {
        ada: DeliveryMethod.SELLER_PICKUP,
        tunde: DeliveryMethod.DISPATCH,
      });
      const pickup = of(w.ada.id);
      expect(pickup.fulfillmentStatus).toBe('AWAITING_PICKUP');
      // The buyer has the pickup code as soon as it's paid (C7)
      const buyerAgent = await signIn(ctx.app, w.buyer.email);
      const view = (
        await buyerAgent.get(`/api/orders/${order.id}`).expect(200)
      ).body.data.sellerOrders.find(
        (so: { id: string }) => so.id === pickup.id,
      );
      expect(view.collectionCode).toBe(pickup.collectionCode);

      const ada = await signIn(ctx.app, w.ada.email);
      const tunde = await signIn(ctx.app, w.tunde.email);
      await tunde.get(`/api/sellers/me/orders/${pickup.id}`).expect(404);
      await tunde
        .post(`/api/sellers/me/orders/${pickup.id}/handover`)
        .send({ code: pickup.collectionCode })
        .expect(404);
      await ada
        .post(`/api/sellers/me/orders/${pickup.id}/handover`)
        .send({ code: pickup.collectionCode === '123' ? '124' : '123' })
        .expect(400);
      const handed = await ada
        .post(`/api/sellers/me/orders/${pickup.id}/handover`)
        .send({ code: pickup.collectionCode })
        .expect(200);
      expect(handed.body.data).toMatchObject({
        fulfillmentStatus: 'COLLECTED',
        canCancel: false,
      });
      await ada
        .post(`/api/sellers/me/orders/${pickup.id}/cancel`)
        .send({ reason: 'Changed my mind' })
        .expect(409);

      // Tunde cancels before the rider comes: refunded, his fault (F10, P6), the job closes
      const dispatch = of(w.tunde.id);
      await tunde
        .post(`/api/sellers/me/orders/${dispatch.id}/cancel`)
        .send({})
        .expect(400);
      const cancelled = await tunde
        .post(`/api/sellers/me/orders/${dispatch.id}/cancel`)
        .send({ reason: 'Sold it elsewhere' })
        .expect(200);
      expect(cancelled.body.data).toMatchObject({
        fulfillmentStatus: 'CANCELLED',
        escrowStatus: 'REFUNDED',
        cancelReason: 'SELLER_CANCELLED',
      });
      await expect(
        ctx.prisma.sellerOrder.findUniqueOrThrow({
          where: { id: dispatch.id },
        }),
      ).resolves.toMatchObject({ fault: 'SELLER' });
      await expect(
        ctx.prisma.deliveryJob.findUniqueOrThrow({ where: { id: job!.id } }),
      ).resolves.toMatchObject({ status: 'CANCELLED' });
      const counts = (
        await tunde.get('/api/sellers/me/orders/counts').expect(200)
      ).body.data;
      expect(counts).toMatchObject({ TO_PREPARE: 0, CANCELLED: 1 });
    });
  });
});
