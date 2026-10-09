import { seed, SEED_INSTITUTION, SEED_STATIONS } from '../prisma/seed';
import {
  FulfillmentStatus,
  ListingCategory,
  ListingStatus,
  PaymentMethod,
  ProductCondition,
  UserRole,
} from '../src/generated/prisma/enums';
import {
  client,
  createTestApp,
  createUser,
  resetRateLimits,
  TestContext,
  truncateAll,
} from './utils';

// The Phase 2 checklist as tests. There are no commerce endpoints yet, so the review rows are
// written straight through Prisma against the migrated schema.
describe('Phase 2 commerce schema (e2e)', () => {
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

  describe('seed', () => {
    const env = {
      SEED_ADMIN_EMAIL: ' Admin@CampusMart.test ',
      SEED_ADMIN_PASSWORD: 'SeedAdmin123',
    };

    it('creates an institution, two stations and an admin you can sign in with', async () => {
      await seed(ctx.prisma, env);

      const institutions = await ctx.prisma.institution.findMany();
      expect(institutions).toHaveLength(1);
      expect(institutions[0]).toMatchObject({
        ...SEED_INSTITUTION,
        isActive: true,
      });

      const stations = await ctx.prisma.pickupStation.findMany({
        orderBy: { name: 'asc' },
      });
      expect(stations).toHaveLength(SEED_STATIONS.length);
      expect(stations).toHaveLength(2);
      for (const station of stations) {
        expect(station).toMatchObject({
          institutionId: institutions[0].id,
          isActive: true,
        });
        expect(station.openingHours).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ day: 'MON', open: expect.any(String) }),
          ]),
        );
      }

      const agent = client(ctx.app);
      const login = await agent
        .post('/api/auth/login')
        .send({
          email: 'admin@campusmart.test',
          password: env.SEED_ADMIN_PASSWORD,
        })
        .expect(200);
      expect(login.body.data).toMatchObject({
        email: 'admin@campusmart.test',
        role: 'ADMIN',
      });
      expect(login.body.data.emailVerifiedAt).not.toBeNull();
      const me = await agent.get('/api/auth/me').expect(200);
      expect(me.body.data.role).toBe('ADMIN');
    });

    it('can run again without duplicating rows or changing the admin password', async () => {
      await seed(ctx.prisma, env);
      await seed(ctx.prisma, {
        ...env,
        SEED_ADMIN_PASSWORD: 'Different456',
      });

      await expect(ctx.prisma.institution.count()).resolves.toBe(1);
      await expect(ctx.prisma.pickupStation.count()).resolves.toBe(2);
      await expect(ctx.prisma.user.count()).resolves.toBe(1);
      await client(ctx.app)
        .post('/api/auth/login')
        .send({
          email: 'admin@campusmart.test',
          password: env.SEED_ADMIN_PASSWORD,
        })
        .expect(200);
    });

    it('puts the admin in the seeded institution when the email is on its domain', async () => {
      const { admin, institution } = await seed(ctx.prisma, {
        ...env,
        SEED_ADMIN_EMAIL: `ops@students.${SEED_INSTITUTION.domains[0]}`,
      });
      const row = await ctx.prisma.user.findUniqueOrThrow({
        where: { id: admin.id },
      });
      expect(row.institutionId).toBe(institution.id);
    });

    it('refuses to run without admin credentials or with a weak password', async () => {
      await expect(seed(ctx.prisma, {})).rejects.toThrow(/SEED_ADMIN_EMAIL/);
      await expect(
        seed(ctx.prisma, { ...env, SEED_ADMIN_PASSWORD: 'password' }),
      ).rejects.toThrow(/SEED_ADMIN_PASSWORD/);
      await expect(ctx.prisma.user.count()).resolves.toBe(0);
    });
  });

  describe('reviews', () => {
    // A buyer pays for two separate orders from the same seller and reviews the same listing
    // on each, so the seller ends up with two reviews.
    async function fixture() {
      const institution = await ctx.prisma.institution.create({
        data: { name: 'University of Lagos', domains: ['unilag.edu.ng'] },
      });
      const station = await ctx.prisma.pickupStation.create({
        data: {
          institutionId: institution.id,
          name: 'Main Gate',
          address: 'Main Gate',
          contactName: 'Agent',
          contactPhone: '+2348000000000',
          openingHours: [{ day: 'MON', open: '09:00', close: '17:00' }],
        },
      });
      const seller = await createUser(ctx.prisma, {
        role: UserRole.SELLER,
        institutionId: institution.id,
      });
      const buyer = await createUser(ctx.prisma, {
        institutionId: institution.id,
      });
      const listing = await ctx.prisma.listing.create({
        data: {
          title: 'Desk lamp',
          description: 'Warm light',
          priceKobo: 450_000,
          stock: 5,
          category: ListingCategory.TECH,
          condition: ProductCondition.USED_GOOD,
          status: ListingStatus.ACTIVE,
          sellerId: seller.id,
          institutionId: institution.id,
        },
      });

      const collectedSellerOrder = async (n: number) => {
        const order = await ctx.prisma.order.create({
          data: {
            buyerId: buyer.id,
            institutionId: institution.id,
            pickupStationId: station.id,
            paymentMethod: PaymentMethod.CARD,
            subtotalKobo: 450_000,
            totalKobo: 450_000,
            idempotencyKey: `key-${n}`,
            expiresAt: new Date(Date.now() + 30 * 60_000),
          },
        });
        return ctx.prisma.sellerOrder.create({
          data: {
            orderId: order.id,
            sellerId: seller.id,
            code: `CM-TEST0${n}`,
            collectionCode: '123456',
            fulfillmentStatus: FulfillmentStatus.COLLECTED,
            subtotalKobo: 450_000,
            sellerPayoutKobo: 450_000,
            items: {
              create: {
                listingId: listing.id,
                titleSnapshot: listing.title,
                unitPriceKobo: listing.priceKobo,
                quantity: 1,
              },
            },
          },
        });
      };

      return {
        seller,
        buyer,
        listing,
        first: await collectedSellerOrder(1),
        second: await collectedSellerOrder(2),
      };
    }

    it('a user can receive two reviews', async () => {
      const { seller, buyer, listing, first, second } = await fixture();

      for (const [sellerOrder, rating] of [
        [first, 5],
        [second, 4],
      ] as const) {
        await ctx.prisma.review.create({
          data: {
            rating,
            reviewerId: buyer.id,
            revieweeId: seller.id,
            listingId: listing.id,
            sellerOrderId: sellerOrder.id,
          },
        });
      }

      const received = await ctx.prisma.user.findUniqueOrThrow({
        where: { id: seller.id },
        select: { reviewsReceived: { select: { rating: true } } },
      });
      expect(received.reviewsReceived.map((r) => r.rating).sort()).toEqual([
        4, 5,
      ]);
    });

    it('allows one review per listing per seller order', async () => {
      const { seller, buyer, listing, first } = await fixture();
      const data = {
        rating: 5,
        reviewerId: buyer.id,
        revieweeId: seller.id,
        listingId: listing.id,
        sellerOrderId: first.id,
      };
      await ctx.prisma.review.create({ data });
      await expect(ctx.prisma.review.create({ data })).rejects.toMatchObject({
        code: 'P2002',
      });
    });
  });
});
