import { randomUUID } from 'crypto';
import request from 'supertest';
import { OrderStatus, UserRole } from '../src/generated/prisma/enums';
import {
  createCampusPlace,
  createListing,
  createSchool,
  createSeller,
} from './commerce-fixtures';
import {
  createTestApp,
  createUser,
  DELIVERY_DETAILS,
  resetRateLimits,
  signIn,
  TestContext,
  truncateAll,
} from './utils';

type Agent = Awaited<ReturnType<typeof signIn>>;

const PHONE = '+234 801 234 5678';
const FEE = 50_000;

// Phase 4b: checkout with delivery (decisions F2, DL1-DL10, DF1-DF6, SA1-SA4, PH2, C9, C10)
describe('Phase 4b delivery checkout (e2e)', () => {
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

  // Ada lets buyers collect from her; Tunde only ships by dispatch
  async function world({ fee = FEE } = {}) {
    const school = await createSchool(ctx.prisma);
    await ctx.prisma.institution.update({
      where: { id: school.id },
      data: { deliveryFeeKobo: fee },
    });
    const place = await createCampusPlace(ctx.prisma, school.id);
    const ada = await createSeller(ctx.prisma, school.id, 'Ada Wears', {
      allowsPickup: true,
    });
    const tunde = await createSeller(ctx.prisma, school.id, 'Tunde Tech');
    const buyer = await createUser(ctx.prisma, { institutionId: school.id });
    const agent = await signIn(ctx.app, buyer.email);
    const dress = await createListing(ctx.prisma, ada, {
      title: 'Ankara dress',
      priceKobo: 1_200_000,
    });
    const lamp = await createListing(ctx.prisma, tunde, {
      priceKobo: 450_000,
    });
    return { school, place, ada, tunde, buyer, agent, dress, lamp };
  }

  const add = (agent: Agent, listingId: string, quantity = 1) =>
    agent.put('/api/cart/items').send({ listingId, quantity }).expect(200);

  const checkout = (agent: Agent, body: object) =>
    agent.post('/api/orders/checkout').send({
      paymentMethod: 'CARD',
      idempotencyKey: randomUUID(),
      ...body,
    });

  describe('checkout', () => {
    it('a dispatch store and a pickup store: two seller orders, items plus one campus fee', async () => {
      const { place, ada, tunde, buyer, agent, dress, lamp } = await world();
      await add(agent, dress.id);
      await add(agent, lamp.id, 2);

      const placed = await checkout(agent, {
        stores: [
          { sellerId: ada.id, method: 'SELLER_PICKUP' },
          { sellerId: tunde.id, method: 'DISPATCH' },
        ],
        destination: { campusPlaceId: place.id },
        phone: PHONE,
      }).expect(201);
      expect(placed.body.data.totalKobo).toBe(1_200_000 + 900_000 + FEE);

      const order = (
        await agent.get(`/api/orders/${placed.body.data.orderId}`).expect(200)
      ).body.data;
      expect(order).toMatchObject({
        subtotalKobo: 2_100_000,
        deliveryFeeKobo: FEE,
        totalKobo: 2_100_000 + FEE,
        pickupStation: null,
        destination: {
          campusPlace: { id: place.id, name: 'Faculty of Science' },
          address: null,
        },
        buyerPhone: PHONE,
      });
      const byStore = Object.fromEntries(
        order.sellerOrders.map(
          (so: { seller: { storeName: string }; deliveryMethod: string }) => [
            so.seller.storeName,
            so.deliveryMethod,
          ],
        ),
      );
      expect(byStore).toEqual({
        'Ada Wears': 'SELLER_PICKUP',
        'Tunde Tech': 'DISPATCH',
      });

      // The phone is kept for next time (decision PH2)
      const me = (await agent.get('/api/auth/me').expect(200)).body.data;
      expect(me.phone).toBe(PHONE);
      await expect(
        ctx.prisma.user.findUniqueOrThrow({ where: { id: buyer.id } }),
      ).resolves.toMatchObject({ phone: PHONE });
    });

    it('two stores by dispatch still pay one fee (decision DF2)', async () => {
      const { place, ada, tunde, agent, dress, lamp } = await world();
      await add(agent, dress.id);
      await add(agent, lamp.id);
      const placed = await checkout(agent, {
        stores: [ada, tunde].map((s) => ({
          sellerId: s.id,
          method: 'DISPATCH',
        })),
        destination: { campusPlaceId: place.id },
        phone: PHONE,
      }).expect(201);
      expect(placed.body.data.totalKobo).toBe(1_200_000 + 450_000 + FEE);
    });

    it('off campus: the typed address, and no fee in the app (decisions DF4, DF4a)', async () => {
      const { tunde, agent, lamp } = await world();
      await add(agent, lamp.id);
      const placed = await checkout(agent, {
        stores: [{ sellerId: tunde.id, method: 'DISPATCH' }],
        destination: { address: '  14 Akoka Road, Yaba  ' },
        phone: PHONE,
      }).expect(201);
      expect(placed.body.data.totalKobo).toBe(450_000);
      const order = (
        await agent.get(`/api/orders/${placed.body.data.orderId}`).expect(200)
      ).body.data;
      expect(order).toMatchObject({
        deliveryFeeKobo: 0,
        destination: { campusPlace: null, address: '14 Akoka Road, Yaba' },
      });
    });

    it('everything picked up needs no destination, phone or fee (decisions C2, C9)', async () => {
      const { ada, agent, dress } = await world();
      await add(agent, dress.id);
      const placed = await checkout(agent, {
        stores: [{ sellerId: ada.id, method: 'SELLER_PICKUP' }],
      }).expect(201);
      expect(placed.body.data.totalKobo).toBe(1_200_000);
      const order = (
        await agent.get(`/api/orders/${placed.body.data.orderId}`).expect(200)
      ).body.data;
      expect(order).toMatchObject({
        destination: null,
        deliveryFeeKobo: 0,
        buyerPhone: null,
      });
    });

    it('refuses a choice the stores or school do not allow, and reserves nothing', async () => {
      const { school, place, ada, tunde, agent, dress, lamp } = await world();
      await add(agent, dress.id);
      await add(agent, lamp.id);
      const dispatchAll = [ada, tunde].map((s) => ({
        sellerId: s.id,
        method: 'DISPATCH',
      }));
      const good = {
        stores: dispatchAll,
        destination: { campusPlaceId: place.id },
        phone: PHONE,
      };
      const refused = async (body: object, status: number, code: string) => {
        const res = await checkout(agent, { ...good, ...body }).expect(status);
        expect(res.body.code).toBe(code);
        return res;
      };

      // Tunde doesn't offer pickup (decision DL1)
      const noPickup = await refused(
        {
          stores: [
            { sellerId: ada.id, method: 'DISPATCH' },
            { sellerId: tunde.id, method: 'SELLER_PICKUP' },
          ],
        },
        409,
        'PICKUP_NOT_OFFERED',
      );
      expect(noPickup.body.details).toEqual({ sellerId: tunde.id });
      await refused(
        { stores: [{ sellerId: ada.id, method: 'DISPATCH' }] },
        400,
        'DELIVERY_CHOICE_REQUIRED',
      );
      // Dispatch needs one destination and a phone (decisions DF6, C9)
      await refused({ destination: undefined }, 400, 'DESTINATION_REQUIRED');
      await refused(
        { destination: { campusPlaceId: place.id, address: '14 Akoka Road' } },
        400,
        'VALIDATION_FAILED',
      );
      await refused({ phone: undefined }, 400, 'PHONE_REQUIRED');
      await refused({ phone: 'call me' }, 400, 'VALIDATION_FAILED');

      // A place at another school, or one switched off, isn't yours to pick
      const elsewhere = await createSchool(ctx.prisma);
      const far = await createCampusPlace(ctx.prisma, elsewhere.id);
      const closed = await createCampusPlace(
        ctx.prisma,
        school.id,
        'Old gate',
        false,
      );
      for (const p of [far, closed]) {
        await checkout(agent, {
          ...good,
          destination: { campusPlaceId: p.id },
        }).expect(404);
      }

      // No campus fee set yet: on-campus dispatch isn't offered (decision C10)
      await ctx.prisma.institution.update({
        where: { id: school.id },
        data: { deliveryFeeKobo: null },
      });
      await refused({}, 409, 'DELIVERY_UNAVAILABLE');

      await expect(ctx.prisma.order.count()).resolves.toBe(0);
      await expect(
        ctx.prisma.listing.findUniqueOrThrow({ where: { id: lamp.id } }),
      ).resolves.toMatchObject({ stock: 5 });
      await expect(ctx.prisma.cartItem.count()).resolves.toBe(2);
    });
  });

  describe('what buyers see of a seller (decisions SA2, SA3)', () => {
    it('the cart shows the pickup area only; the order adds the address and phone once paid', async () => {
      const { ada, tunde, agent, dress, lamp } = await world();
      await add(agent, dress.id);
      await add(agent, lamp.id);

      const cart = (await agent.get('/api/cart').expect(200)).body.data;
      expect(cart.campusDeliveryFeeKobo).toBe(FEE);
      expect(
        cart.groups.map(
          (g: { seller: { storeName: string; pickupArea: string | null } }) => [
            g.seller.storeName,
            g.seller.pickupArea,
          ],
        ),
      ).toEqual([
        ['Ada Wears', 'Moremi Hall'],
        ['Tunde Tech', null],
      ]);
      const listing = await agent.get(`/api/listings/${dress.id}`).expect(200);
      for (const body of [JSON.stringify(cart), JSON.stringify(listing.body)]) {
        expect(body).not.toContain(DELIVERY_DETAILS.pickupAddress);
        expect(body).not.toContain(DELIVERY_DETAILS.contactPhone);
      }

      const { orderId } = (
        await checkout(agent, {
          stores: [
            { sellerId: ada.id, method: 'SELLER_PICKUP' },
            { sellerId: tunde.id, method: 'DISPATCH' },
          ],
          destination: { address: '14 Akoka Road, Yaba' },
          phone: PHONE,
        }).expect(201)
      ).body.data;
      // Both seller orders are created together, so find each by its store
      type Store = { seller: { id: string }; pickupFrom: unknown };
      const store = (order: { sellerOrders: Store[] }, sellerId: string) =>
        order.sellerOrders.find((so) => so.seller.id === sellerId);
      const before = (await agent.get(`/api/orders/${orderId}`).expect(200))
        .body.data;
      expect(store(before, ada.id)?.pickupFrom).toEqual({
        area: 'Moremi Hall',
        address: null,
        phone: null,
      });
      expect(JSON.stringify(before)).not.toContain(
        DELIVERY_DETAILS.pickupAddress,
      );

      // Payments arrive in Phase 5; mark it paid directly
      await ctx.prisma.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.PAID, paidAt: new Date() },
      });
      const after = (await agent.get(`/api/orders/${orderId}`).expect(200)).body
        .data;
      expect(store(after, ada.id)?.pickupFrom).toEqual({
        area: 'Moremi Hall',
        address: DELIVERY_DETAILS.pickupAddress,
        phone: DELIVERY_DETAILS.contactPhone,
      });
      // The rider collects from Tunde; the buyer never needs his address
      expect(store(after, tunde.id)?.pickupFrom).toBeNull();
    });
  });

  describe('sellers', () => {
    it('can save drafts, but publish only with an area, address and phone (decision SA1)', async () => {
      const school = await createSchool(ctx.prisma);
      const seller = await createUser(ctx.prisma, {
        role: UserRole.SELLER,
        institutionId: school.id,
        verificationStatus: 'VERIFIED',
      });
      const agent = await signIn(ctx.app, seller.email);
      const photo = (n: number) => ({
        url: `https://res.cloudinary.com/campusmart-test/image/upload/v1/campusmart/listings/${seller.id}/p${n}.jpg`,
        publicId: `campusmart/listings/${seller.id}/p${n}`,
      });
      const body = {
        title: 'Desk lamp',
        description: 'Warm light',
        priceKobo: 450_000,
        stock: 2,
        category: 'TECH',
        condition: 'USED_GOOD',
        images: [photo(1)],
      };

      const blocked = await agent
        .post('/api/listings')
        .send({ ...body, status: 'ACTIVE', confirmNotProhibited: true })
        .expect(403);
      expect(blocked.body.code).toBe('SELLER_PROFILE_INCOMPLETE');
      const draft = (
        await agent
          .post('/api/listings')
          .send({ ...body, status: 'DRAFT' })
          .expect(201)
      ).body.data;

      // Pickup needs the details first (decision DL1)
      const early = await agent
        .patch('/api/sellers/me')
        .send({ allowsPickup: true })
        .expect(400);
      expect(early.body.code).toBe('PICKUP_DETAILS_REQUIRED');

      const profile = (
        await agent
          .patch('/api/sellers/me')
          .send({ ...DELIVERY_DETAILS, allowsPickup: true })
          .expect(200)
      ).body.data;
      expect(profile).toMatchObject({
        ...DELIVERY_DETAILS,
        allowsPickup: true,
        deliveryDetailsComplete: true,
      });
      await agent
        .patch(`/api/listings/${draft.id}/status`)
        .send({ status: 'ACTIVE', confirmNotProhibited: true })
        .expect(200);

      await agent
        .patch('/api/sellers/me')
        .send({ contactPhone: 'call me' })
        .expect(400);
      await agent
        .patch('/api/sellers/me')
        .send({ pickupAddress: 'x' })
        .expect(400);
    });
  });

  describe('campus places', () => {
    it("a buyer sees their own school's active places only", async () => {
      const { school, place, agent } = await world();
      await createCampusPlace(ctx.prisma, school.id, 'Old gate', false);
      const second = await createCampusPlace(
        ctx.prisma,
        school.id,
        'Main Gate',
      );
      const elsewhere = await createSchool(ctx.prisma);
      await createCampusPlace(ctx.prisma, elsewhere.id, 'Their hall');

      const list = (await agent.get('/api/campus-places').expect(200)).body
        .data;
      expect(list).toEqual([
        { id: place.id, name: 'Faculty of Science' },
        { id: second.id, name: 'Main Gate' },
      ]);
      await request(ctx.app.getHttpServer())
        .get('/api/campus-places')
        .expect(401);
    });

    it('admins add, rename and switch off places and set the campus fee; nobody else can', async () => {
      const school = await createSchool(ctx.prisma);
      const admin = await createUser(ctx.prisma, { role: UserRole.ADMIN });
      const seller = await createSeller(ctx.prisma, school.id);
      const a = await signIn(ctx.app, admin.email);
      const s = await signIn(ctx.app, seller.email);

      const created = (
        await a
          .post('/api/admin/campus-places')
          .send({ institutionId: school.id, name: 'Moremi Hall' })
          .expect(201)
      ).body.data;
      expect(created).toMatchObject({
        name: 'Moremi Hall',
        isActive: true,
        institution: { id: school.id },
        orderCount: 0,
      });
      await a
        .post('/api/admin/campus-places')
        .send({ institutionId: school.id, name: 'moremi hall' })
        .expect(409);
      // Switching off needs a reason
      await a
        .patch(`/api/admin/campus-places/${created.id}`)
        .send({ isActive: false })
        .expect(400);
      await a
        .patch(`/api/admin/campus-places/${created.id}`)
        .send({ isActive: false, reason: 'Hall closed for repairs' })
        .expect(200);
      const list = (
        await a
          .get(`/api/admin/campus-places?institutionId=${school.id}`)
          .expect(200)
      ).body.data;
      expect(list.items).toHaveLength(1);
      expect(list.items[0].isActive).toBe(false);

      const fee = (
        await a
          .patch(`/api/admin/institutions/${school.id}`)
          .send({ deliveryFeeKobo: FEE })
          .expect(200)
      ).body.data;
      expect(fee).toMatchObject({ deliveryFeeKobo: FEE, placeCount: 1 });
      await a
        .patch(`/api/admin/institutions/${school.id}`)
        .send({ deliveryFeeKobo: -1 })
        .expect(400);
      await a
        .patch(`/api/admin/institutions/${school.id}`)
        .send({ deliveryFeeKobo: 1.5 })
        .expect(400);

      const actions = await ctx.prisma.auditLog.findMany({
        where: { actorId: admin.id },
        orderBy: { createdAt: 'asc' },
        select: { action: true },
      });
      expect(actions.map((x) => x.action)).toEqual([
        'PLACE_CREATED',
        'PLACE_DEACTIVATED',
        'INSTITUTION_UPDATED',
      ]);

      // A seller is refused everywhere, a stranger is asked to sign in
      await s.get('/api/admin/campus-places').expect(403);
      await s
        .post('/api/admin/campus-places')
        .send({ institutionId: school.id, name: 'Sneaky' })
        .expect(403);
      await s
        .patch(`/api/admin/institutions/${school.id}`)
        .send({ deliveryFeeKobo: 0 })
        .expect(403);
      await request(ctx.app.getHttpServer())
        .get('/api/admin/campus-places')
        .expect(401);
    });
  });
});
