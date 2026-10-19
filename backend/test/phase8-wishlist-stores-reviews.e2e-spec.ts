import {
  DeliveryMethod,
  FulfillmentStatus,
  ListingStatus,
  UserRole,
} from '../src/generated/prisma/enums';
import { PaymentsService } from '../src/payments/payments.service';
import { ReviewRemindersService } from '../src/reviews/review-reminders.service';
import { TrustService } from '../src/trust/trust.service';
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

const HOUR = 60 * 60 * 1000;

describe('Phase 8 wishlist, stores, reviews and trust (e2e)', () => {
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

  async function world() {
    const school = await fx.createSchool(ctx.prisma);
    const other = await fx.createSchool(ctx.prisma);
    const place = await fx.createCampusPlace(ctx.prisma, school.id);
    const ada = await fx.createSeller(ctx.prisma, school.id, 'Ada Wears', {
      allowsPickup: true,
    });
    const tunde = await fx.createSeller(ctx.prisma, school.id, 'Tunde Tech');
    const farSeller = await fx.createSeller(ctx.prisma, other.id, 'Far Away');
    const buyer = await createUser(ctx.prisma, { institutionId: school.id });
    const buyer2 = await createUser(ctx.prisma, { institutionId: school.id });
    const admin = await createUser(ctx.prisma, { role: UserRole.ADMIN });
    return {
      school,
      other,
      place,
      ada,
      tunde,
      farSeller,
      buyer,
      buyer2,
      admin,
    };
  }
  type World = Awaited<ReturnType<typeof world>>;
  type Seller = World['ada'];

  // One store per entry, paid through the real webhook handler
  async function paidOrder(
    w: World,
    sellers: Seller[],
    buyer: { id: string; institutionId: string | null } = w.buyer,
  ) {
    const placed = await fx.createUnpaidOrder(
      ctx.prisma,
      buyer,
      sellers.map((seller) => ({ seller, method: DeliveryMethod.DISPATCH })),
      { campusPlaceId: w.place.id },
    );
    await ctx.app
      .get(PaymentsService)
      .handleEvent(fx.chargeSuccess(placed.reference, placed.totalKobo));
    const rows = await ctx.prisma.sellerOrder.findMany({
      where: { orderId: placed.id },
      include: { items: true },
    });
    return {
      orderId: placed.id,
      of: (sellerId: string) => rows.find((so) => so.sellerId === sellerId)!,
    };
  }

  // Handed over at a given time, as the rider would have (Phase 6 covers the handover itself)
  const delivered = (sellerOrderId: string, at = new Date()) =>
    ctx.prisma.sellerOrder.update({
      where: { id: sellerOrderId },
      data: {
        fulfillmentStatus: FulfillmentStatus.DELIVERED,
        collectedAt: at,
        releaseAt: new Date(at.getTime() + 48 * HOUR),
      },
    });

  describe('wishlist (guide 8.1, R5)', () => {
    it('saves, lists and removes favourites at your own school', async () => {
      const w = await world();
      const lamp = await fx.createListing(ctx.prisma, w.ada, { title: 'Lamp' });
      const kettle = await fx.createListing(ctx.prisma, w.tunde, {
        title: 'Kettle',
      });
      const far = await fx.createListing(ctx.prisma, w.farSeller);
      const buyer = await signIn(ctx.app, w.buyer.email);

      await buyer.put(`/api/wishlist/${lamp.id}`).expect(204);
      await buyer.put(`/api/wishlist/${lamp.id}`).expect(204); // idempotent
      await buyer.put(`/api/wishlist/${kettle.id}`).expect(204);
      await buyer.put(`/api/wishlist/${far.id}`).expect(404);
      await buyer
        .put('/api/wishlist/00000000-0000-4000-8000-000000000000')
        .expect(404);
      await expect(
        ctx.prisma.wishlist.count({ where: { userId: w.buyer.id } }),
      ).resolves.toBe(2);

      // A sold-out item stays, marked unavailable
      await ctx.prisma.listing.update({
        where: { id: kettle.id },
        data: { status: ListingStatus.SOLDOUT, stock: 0 },
      });
      const page = (await buyer.get('/api/wishlist').expect(200)).body.data;
      expect(
        page.items.map((i: { title: string; available: boolean }) => [
          i.title,
          i.available,
        ]),
      ).toEqual([
        ['Kettle', false],
        ['Lamp', true],
      ]);
      expect(page.items[1].seller).toMatchObject({
        displayName: 'Ada Wears',
        trusted: false,
      });
      expect(
        (await buyer.get('/api/wishlist/ids').expect(200)).body.data.listingIds,
      ).toHaveLength(2);

      await buyer.delete(`/api/wishlist/${kettle.id}`).expect(204);
      await buyer.delete(`/api/wishlist/${kettle.id}`).expect(204);
      expect(
        (await buyer.get('/api/wishlist/ids').expect(200)).body.data,
      ).toEqual({ listingIds: [lamp.id] });

      // Nobody else sees them; riders don't buy (DX7); signed out is 401
      const other = await signIn(ctx.app, w.buyer2.email);
      expect(
        (await other.get('/api/wishlist/ids').expect(200)).body.data.listingIds,
      ).toEqual([]);
      const rider = await createUser(ctx.prisma, {
        role: UserRole.DISPATCH,
        institutionId: w.school.id,
      });
      await (
        await signIn(ctx.app, rider.email)
      )
        .put(`/api/wishlist/${lamp.id}`)
        .expect(403);
      await client(ctx.app).get('/api/wishlist').expect(401);
    });

    it('moves favourites saved on the phone into the account, skipping ones the user can’t see (R5)', async () => {
      const w = await world();
      const lamp = await fx.createListing(ctx.prisma, w.ada);
      const kettle = await fx.createListing(ctx.prisma, w.tunde);
      const far = await fx.createListing(ctx.prisma, w.farSeller);
      const buyer = await signIn(ctx.app, w.buyer.email);
      await buyer.put(`/api/wishlist/${lamp.id}`).expect(204);

      const merged = await buyer
        .post('/api/wishlist/merge')
        .send({
          listingIds: [lamp.id, kettle.id, far.id, kettle.id],
        })
        .expect(200);
      expect([...merged.body.data.listingIds].sort()).toEqual(
        [lamp.id, kettle.id].sort(),
      );
      await buyer
        .post('/api/wishlist/merge')
        .send({ listingIds: ['not-a-uuid'] })
        .expect(400);
      await buyer
        .post('/api/wishlist/merge')
        .send({ listingIds: [], extra: true })
        .expect(400);
    });
  });

  describe('reviews (guide 8.4, R4)', () => {
    it('only the buyer, only once received, once per item; ratings update at once', async () => {
      const w = await world();
      const order = await paidOrder(w, [w.ada]);
      const so = order.of(w.ada.id);
      const listingId = so.items[0].listingId;
      const buyer = await signIn(ctx.app, w.buyer.email);
      const review = (body: object, agent = buyer) =>
        agent.post(`/api/seller-orders/${so.id}/reviews`).send(body);

      // Not received yet: 403
      await review({ listingId, rating: 5 })
        .expect(403)
        .expect(({ body }) => expect(body.code).toBe('REVIEW_NOT_OPEN'));
      await delivered(so.id);

      // Someone else's order: 404; a listing not in it: 400; a bad rating: 400
      await review(
        { listingId, rating: 5 },
        await signIn(ctx.app, w.buyer2.email),
      ).expect(404);
      const elsewhere = await fx.createListing(ctx.prisma, w.ada);
      await review({ listingId: elsewhere.id, rating: 4 })
        .expect(400)
        .expect(({ body }) => expect(body.code).toBe('NOT_IN_ORDER'));
      await review({ listingId, rating: 6 }).expect(400);
      await review({ listingId, rating: 4, comment: 'x'.repeat(501) }).expect(
        400,
      );

      const created = await review({
        listingId,
        rating: 4,
        comment: '  Works well  ',
      }).expect(201);
      expect(created.body.data).toMatchObject({
        rating: 4,
        comment: 'Works well',
        reviewerDisplayName: 'Test',
        listingTitle: 'Desk lamp',
      });

      // Twice: 409
      await review({ listingId, rating: 1 })
        .expect(409)
        .expect(({ body }) => expect(body.code).toBe('ALREADY_REVIEWED'));

      // The listing's and the seller's ratings are updated right away
      await expect(
        ctx.prisma.listing.findUniqueOrThrow({ where: { id: listingId } }),
      ).resolves.toMatchObject({ ratingAvg: 4, ratingCount: 1 });
      await expect(
        ctx.prisma.sellerProfile.findUniqueOrThrow({
          where: { userId: w.ada.id },
        }),
      ).resolves.toMatchObject({ ratingAvg: 4, ratingCount: 1 });

      // A second order from Ada, rated 5: the seller averages 4.5
      const again = await paidOrder(w, [w.ada]);
      await delivered(again.of(w.ada.id).id);
      await buyer
        .post(`/api/seller-orders/${again.of(w.ada.id).id}/reviews`)
        .send({ listingId: again.of(w.ada.id).items[0].listingId, rating: 5 })
        .expect(201);
      await expect(
        ctx.prisma.sellerProfile.findUniqueOrThrow({
          where: { userId: w.ada.id },
        }),
      ).resolves.toMatchObject({ ratingAvg: 4.5, ratingCount: 2 });

      // The buyer's order shows what they gave
      const view = (await buyer.get(`/api/orders/${order.orderId}`).expect(200))
        .body.data;
      expect(view.sellerOrders[0]).toMatchObject({ canReview: true });
      expect(view.sellerOrders[0].items[0].myRating).toBe(4);

      // Anyone at the school reads them; another school can't
      const reviews = await (
        await signIn(ctx.app, w.buyer2.email)
      )
        .get(`/api/listings/${listingId}/reviews`)
        .expect(200);
      expect(reviews.body.data.items).toHaveLength(1);
      const far = await createUser(ctx.prisma, {
        institutionId: w.other.id,
      });
      await (
        await signIn(ctx.app, far.email)
      )
        .get(`/api/listings/${listingId}/reviews`)
        .expect(404);
    });

    it('an admin hides an abusive review with a reason; it stops counting and showing', async () => {
      const w = await world();
      const order = await paidOrder(w, [w.ada]);
      const so = order.of(w.ada.id);
      await delivered(so.id);
      const buyer = await signIn(ctx.app, w.buyer.email);
      const id = (
        await buyer
          .post(`/api/seller-orders/${so.id}/reviews`)
          .send({
            listingId: so.items[0].listingId,
            rating: 1,
            comment: 'Abuse',
          })
          .expect(201)
      ).body.data.id;

      const admin = await signIn(ctx.app, w.admin.email);
      await buyer
        .post(`/api/admin/reviews/${id}/hide`)
        .send({ reason: 'Abusive words' })
        .expect(403);
      await admin.post(`/api/admin/reviews/${id}/hide`).send({}).expect(400);
      const hidden = await admin
        .post(`/api/admin/reviews/${id}/hide`)
        .send({ reason: 'Abusive words' })
        .expect(200);
      expect(hidden.body.data).toMatchObject({
        hiddenReason: 'Abusive words',
        storeName: 'Ada Wears',
      });
      await admin
        .post(`/api/admin/reviews/${id}/hide`)
        .send({ reason: 'Again please' })
        .expect(409);
      await expect(
        ctx.prisma.sellerProfile.findUniqueOrThrow({
          where: { userId: w.ada.id },
        }),
      ).resolves.toMatchObject({ ratingAvg: 0, ratingCount: 0 });
      expect(
        (
          await buyer
            .get(`/api/listings/${so.items[0].listingId}/reviews`)
            .expect(200)
        ).body.data.items,
      ).toEqual([]);
      expect(
        (await admin.get('/api/admin/reviews?view=HIDDEN').expect(200)).body
          .data.items,
      ).toHaveLength(1);
      await expect(
        ctx.prisma.auditLog.count({
          where: { action: 'REVIEW_HIDDEN', entityId: id },
        }),
      ).resolves.toBe(1);

      await admin.post(`/api/admin/reviews/${id}/show`).expect(200);
      await expect(
        ctx.prisma.sellerProfile.findUniqueOrThrow({
          where: { userId: w.ada.id },
        }),
      ).resolves.toMatchObject({ ratingAvg: 1, ratingCount: 1 });
    });

    it('asks the buyer once, 24 hours after handover, to rate what they received', async () => {
      const w = await world();
      const now = new Date();
      const due = await paidOrder(w, [w.ada]);
      await delivered(due.of(w.ada.id).id, new Date(now.getTime() - 25 * HOUR));
      const early = await paidOrder(w, [w.ada]);
      await delivered(
        early.of(w.ada.id).id,
        new Date(now.getTime() - 23 * HOUR),
      );
      const rated = await paidOrder(w, [w.tunde]);
      const ratedSo = rated.of(w.tunde.id);
      await delivered(ratedSo.id, new Date(now.getTime() - 30 * HOUR));
      await (
        await signIn(ctx.app, w.buyer.email)
      )
        .post(`/api/seller-orders/${ratedSo.id}/reviews`)
        .send({ listingId: ratedSo.items[0].listingId, rating: 5 })
        .expect(201);

      const reminders = ctx.app.get(ReviewRemindersService);
      await expect(reminders.remind(now)).resolves.toBe(1);
      await expect(reminders.remind(now)).resolves.toBe(0);
      const sent = await ctx.prisma.notification.findMany({
        where: { userId: w.buyer.id, type: 'REVIEW_REMINDER' },
      });
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({
        title: 'How was your order from Ada Wears?',
        data: { link: `/orders/${due.orderId}#rate` },
      });
    });
  });

  describe('stores and the trust score (guide 8.2, 8.4, R1–R3)', () => {
    it('ranks featured stores by rating and reviews, then recent paid orders; another school is hidden', async () => {
      const w = await world();
      const chi = await fx.createSeller(ctx.prisma, w.school.id, 'Chi Books');
      const empty = await fx.createSeller(ctx.prisma, w.school.id, 'Empty');
      await fx.createListing(ctx.prisma, w.ada);
      await fx.createListing(ctx.prisma, w.tunde);
      await fx.createListing(ctx.prisma, chi);
      await fx.createListing(ctx.prisma, w.farSeller);
      await fx.createListing(ctx.prisma, empty, {
        status: ListingStatus.DRAFT,
      });
      // Ada's 4.5 from 2 reviews ranks above Tunde's 5.0 from 1 (R3); Chi has no reviews yet
      await ctx.prisma.sellerProfile.update({
        where: { userId: w.ada.id },
        data: { ratingAvg: 4.5, ratingCount: 2 },
      });
      await ctx.prisma.sellerProfile.update({
        where: { userId: w.tunde.id },
        data: { ratingAvg: 5, ratingCount: 1 },
      });
      await paidOrder(w, [chi]);

      const buyer = await signIn(ctx.app, w.buyer.email);
      const featured = (
        await buyer.get('/api/stores?featured=true').expect(200)
      ).body.data;
      expect(
        featured.items.map((s: { storeName: string }) => s.storeName),
      ).toEqual(['Ada Wears', 'Tunde Tech', 'Chi Books']);
      expect(featured.items[0]).toMatchObject({
        sellerId: w.ada.id,
        ratingAvg: 4.5,
        ratingCount: 2,
        verified: true,
        trusted: false,
        listingCount: 1,
      });
      expect(featured.nextCursor).toBeNull();

      // All stores, two at a time
      const first = (await buyer.get('/api/stores?limit=2').expect(200)).body
        .data;
      expect(first.nextCursor).toBe('2');
      const second = (
        await buyer.get(`/api/stores?limit=2&cursor=${first.nextCursor}`)
      ).body.data;
      expect(
        second.items.map((s: { storeName: string }) => s.storeName),
      ).toEqual(['Chi Books']);

      // A store page: the area shows only when buyers can pick up from it (SA2)
      const ada = (await buyer.get(`/api/stores/${w.ada.id}`).expect(200)).body
        .data;
      expect(ada).toMatchObject({
        storeName: 'Ada Wears',
        pickupArea: 'Moremi Hall',
      });
      const tunde = (await buyer.get(`/api/stores/${w.tunde.id}`).expect(200))
        .body.data;
      expect(tunde.pickupArea).toBeNull();
      expect(
        (await buyer.get(`/api/stores/${w.ada.id}/listings`).expect(200)).body
          .data.items,
      ).toHaveLength(1);
      await buyer.get(`/api/stores/${w.ada.id}/reviews`).expect(200);
      await buyer.get(`/api/stores/${w.farSeller.id}`).expect(404);
      await buyer.get(`/api/stores/${w.buyer2.id}`).expect(404);
      await buyer.get('/api/stores?cursor=abc').expect(400);
    });

    it('scores sellers nightly with the settings’ weights; a seller-fault refund lowers it (P6, carried from Phase 5)', async () => {
      const w = await world();
      const trust = ctx.app.get(TrustService);
      const buyer = await signIn(ctx.app, w.buyer.email);

      // Ada: verified, two orders delivered and rated 5
      for (let i = 0; i < 2; i++) {
        const o = await paidOrder(w, [w.ada]);
        const so = o.of(w.ada.id);
        await delivered(so.id);
        await buyer
          .post(`/api/seller-orders/${so.id}/reviews`)
          .send({ listingId: so.items[0].listingId, rating: 5 })
          .expect(201);
      }
      await trust.recalculate(new Date());
      const score = async () =>
        (await ctx.prisma.user.findUniqueOrThrow({ where: { id: w.ada.id } }))
          .trustScore;
      await expect(score()).resolves.toBe(100);
      const store = (await buyer.get(`/api/stores/${w.ada.id}`).expect(200))
        .body.data;
      expect(store.trusted).toBe(true);

      // Ada cancels a paid order: refunded, her fault. 2 of 3 settled orders completed now,
      // and 10 points off: 50 + 20 + 20 - 10 = 80
      const cancelled = await paidOrder(w, [w.ada]);
      await (
        await signIn(ctx.app, w.ada.email)
      )
        .post(`/api/sellers/me/orders/${cancelled.of(w.ada.id).id}/cancel`)
        .send({ reason: 'Sold it elsewhere' })
        .expect(200);
      await trust.recalculate(new Date());
      await expect(score()).resolves.toBe(80);

      // A changed weight applies at the next run (R1b)
      const admin = await signIn(ctx.app, w.admin.email);
      await admin
        .patch('/api/admin/settings')
        .send({ trustPenaltySellerFault: 25 })
        .expect(200);
      await expect(score()).resolves.toBe(80);
      await trust.recalculate(new Date());
      await expect(score()).resolves.toBe(65);
      expect(
        (await buyer.get(`/api/stores/${w.ada.id}`).expect(200)).body.data
          .trusted,
      ).toBe(false);

      // An unverified seller with nothing yet scores 0
      const fresh = await createUser(ctx.prisma, {
        role: UserRole.SELLER,
        institutionId: w.school.id,
      });
      await trust.recalculate(new Date());
      await expect(
        ctx.prisma.user.findUniqueOrThrow({ where: { id: fresh.id } }),
      ).resolves.toMatchObject({ trustScore: 0 });
    });
  });
});
