import { randomUUID } from 'crypto';
import request from 'supertest';
import { UserRole, VerificationStatus } from '../src/generated/prisma/enums';
import { recalculateListingStock } from '../src/listings/listing-stock';
import { CloudinaryService } from '../src/uploads/cloudinary.service';
import {
  createTestApp,
  createUser,
  resetRateLimits,
  signIn,
  TestContext,
  truncateAll,
} from './utils';

const CLOUD = process.env.CLOUDINARY_CLOUD_NAME!;

const photo = (sellerId: string, n: number, cloud = CLOUD) => ({
  url: `https://res.cloudinary.com/${cloud}/image/upload/v1700000000/campusmart/listings/${sellerId}/photo${n}.jpg`,
  publicId: `campusmart/listings/${sellerId}/photo${n}`,
});

const listingBody = (sellerId: string, overrides: object = {}) => ({
  title: 'UrbanFlex cargo pants',
  description: 'Comfort-fit cargo pants with six pockets',
  priceKobo: 1_450_000,
  category: 'FASHION',
  condition: 'NEW',
  images: [photo(sellerId, 1), photo(sellerId, 2), photo(sellerId, 3)],
  variants: [
    { label: 'M', stock: 2 },
    { label: 'L', stock: 1, priceKobo: 1_500_000 },
  ],
  status: 'ACTIVE',
  ...overrides,
});

// Phase 3 checklist, plus the rules behind it (guide 3.1)
describe('Phase 3 listings (e2e)', () => {
  let ctx: TestContext;
  let destroy: jest.SpyInstance;

  beforeAll(async () => {
    ctx = await createTestApp();
    destroy = jest
      .spyOn(ctx.app.get(CloudinaryService), 'destroy')
      .mockResolvedValue(undefined);
  });

  beforeEach(async () => {
    await truncateAll(ctx.prisma);
    resetRateLimits(ctx.app);
    destroy.mockClear();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  async function twoSchools() {
    const schoolA = await ctx.prisma.institution.create({
      data: { name: 'University of Lagos', domains: ['unilag.edu.ng'] },
    });
    const schoolB = await ctx.prisma.institution.create({
      data: { name: 'Lagos State University', domains: ['lasu.edu.ng'] },
    });
    // Verified by an admin, so they can publish (phase3-seller-verification covers the rest)
    const sellerA = await createUser(ctx.prisma, {
      role: UserRole.SELLER,
      institutionId: schoolA.id,
      verificationStatus: VerificationStatus.VERIFIED,
    });
    const sellerB = await createUser(ctx.prisma, {
      role: UserRole.SELLER,
      institutionId: schoolB.id,
      verificationStatus: VerificationStatus.VERIFIED,
    });
    const buyerA = await createUser(ctx.prisma, { institutionId: schoolA.id });
    const buyerB = await createUser(ctx.prisma, { institutionId: schoolB.id });
    return { schoolA, schoolB, sellerA, sellerB, buyerA, buyerB };
  }

  async function createListing(
    sellerId: string,
    email: string,
    overrides: object = {},
  ) {
    const agent = await signIn(ctx.app, email);
    const res = await agent
      .post('/api/listings')
      .send(listingBody(sellerId, overrides))
      .expect(201);
    return { agent, listing: res.body.data };
  }

  describe('checklist', () => {
    it('a seller at school A lists with 3 photos and 2 options; school A sees it, school B gets 404', async () => {
      const { sellerA, buyerA, buyerB } = await twoSchools();
      const { listing } = await createListing(sellerA.id, sellerA.email);
      expect(listing).toMatchObject({
        status: 'ACTIVE',
        stock: 3,
        hasVariants: true,
        minPriceKobo: 1_450_000,
        maxPriceKobo: 1_500_000,
        isOwner: true,
      });
      expect(listing.images).toHaveLength(3);
      expect(listing.variants.map((v: { label: string }) => v.label)).toEqual([
        'M',
        'L',
      ]);

      const a = await signIn(ctx.app, buyerA.email);
      const browse = await a.get('/api/listings').expect(200);
      expect(browse.body.data.items.map((i: { id: string }) => i.id)).toEqual([
        listing.id,
      ]);
      const detail = await a.get(`/api/listings/${listing.id}`).expect(200);
      expect(detail.body.data).toMatchObject({
        id: listing.id,
        isOwner: false,
        seller: { id: sellerA.id },
      });
      expect(JSON.stringify(detail.body.data)).not.toContain(sellerA.email);

      const b = await signIn(ctx.app, buyerB.email);
      await b.get(`/api/listings/${listing.id}`).expect(404);
      await b.get(`/api/listings/${listing.id}/related`).expect(404);
      const browseB = await b.get('/api/listings').expect(200);
      expect(browseB.body.data.items).toEqual([]);
    });

    it("seller B gets 404 on PATCH /listings/<A's id>", async () => {
      const { sellerA, sellerB } = await twoSchools();
      const { listing } = await createListing(sellerA.id, sellerA.email);
      const b = await signIn(ctx.app, sellerB.email);
      await b
        .patch(`/api/listings/${listing.id}`)
        .send({ title: 'Not yours' })
        .expect(404);
      await b
        .patch(`/api/listings/${listing.id}/status`)
        .send({ status: 'ARCHIVED' })
        .expect(404);
      await b.delete(`/api/listings/${listing.id}`).expect(404);
      // A seller at the same school who isn't the owner gets 404 too
      const other = await createUser(ctx.prisma, {
        role: UserRole.SELLER,
        institutionId: sellerA.institutionId,
      });
      const o = await signIn(ctx.app, other.email);
      await o
        .patch(`/api/listings/${listing.id}`)
        .send({ title: 'Not yours' })
        .expect(404);
    });

    it('selling the last variant unit flips the listing to SOLDOUT', async () => {
      const { sellerA, buyerA } = await twoSchools();
      const { agent, listing } = await createListing(
        sellerA.id,
        sellerA.email,
        {
          variants: [
            { label: 'M', stock: 0 },
            { label: 'L', stock: 1 },
          ],
        },
      );
      const last = listing.variants.find(
        (v: { label: string }) => v.label === 'L',
      );

      // The checkout's conditional decrement and recalculation (guide 4.2 steps 3 and 4)
      await ctx.prisma.$transaction(async (tx) => {
        const sold = await tx.listingVariant.updateMany({
          where: { id: last.id, stock: { gte: 1 }, isActive: true },
          data: { stock: { decrement: 1 } },
        });
        expect(sold.count).toBe(1);
        await recalculateListingStock(tx, listing.id);
      });

      const own = await agent.get(`/api/listings/${listing.id}`).expect(200);
      expect(own.body.data).toMatchObject({ status: 'SOLDOUT', stock: 0 });
      const buyer = await signIn(ctx.app, buyerA.email);
      await buyer.get(`/api/listings/${listing.id}`).expect(404);

      // Restocking brings it back
      await agent
        .patch(`/api/listings/${listing.id}`)
        .send({
          variants: [
            { label: 'M', stock: 0 },
            { label: 'L', stock: 4 },
          ],
        })
        .expect(200);
      const back = await agent.get(`/api/listings/${listing.id}`).expect(200);
      expect(back.body.data).toMatchObject({ status: 'ACTIVE', stock: 4 });
      // Option ids survive an edit that keeps their names
      expect(
        back.body.data.variants.find((v: { label: string }) => v.label === 'L')
          .id,
      ).toBe(last.id);
    });

    it('an image URL from another Cloudinary account is rejected with 400', async () => {
      const { sellerA } = await twoSchools();
      const agent = await signIn(ctx.app, sellerA.email);
      const res = await agent
        .post('/api/listings')
        .send(
          listingBody(sellerA.id, {
            images: [photo(sellerA.id, 1, 'someone-elses-cloud')],
          }),
        )
        .expect(400);
      expect(res.body.code).toBe('INVALID_IMAGE');
      await expect(ctx.prisma.listing.count()).resolves.toBe(0);
    });
  });

  describe('creating and editing', () => {
    it('only verified sellers can create, and unknown fields are rejected', async () => {
      const { schoolA, sellerA, buyerA } = await twoSchools();
      const buyer = await signIn(ctx.app, buyerA.email);
      await buyer
        .post('/api/listings')
        .send(listingBody(buyerA.id))
        .expect(403);

      const unverified = await createUser(ctx.prisma, {
        role: UserRole.SELLER,
        institutionId: schoolA.id,
        emailVerifiedAt: null,
      });
      const u = await signIn(ctx.app, unverified.email);
      const res = await u
        .post('/api/listings')
        .send(listingBody(unverified.id))
        .expect(403);
      expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');

      const seller = await signIn(ctx.app, sellerA.email);
      await seller
        .post('/api/listings')
        .send(listingBody(sellerA.id, { institutionId: schoolA.id }))
        .expect(400);
      await request(ctx.app.getHttpServer()).get('/api/listings').expect(401);
    });

    it('validates price, photos and option names', async () => {
      const { sellerA } = await twoSchools();
      const agent = await signIn(ctx.app, sellerA.email);
      await agent
        .post('/api/listings')
        .send(listingBody(sellerA.id, { priceKobo: 50 }))
        .expect(400);
      await agent
        .post('/api/listings')
        .send(listingBody(sellerA.id, { images: [] }))
        .expect(400);
      await agent
        .post('/api/listings')
        .send(
          listingBody(sellerA.id, {
            variants: [
              { label: 'M', stock: 1 },
              { label: 'm', stock: 1 },
            ],
          }),
        )
        .expect(400);
      await agent
        .post('/api/listings')
        .send(listingBody(sellerA.id, { variants: undefined }))
        .expect(400); // no options and no stock
    });

    it('replacing photos deletes the old ones from Cloudinary, keeping any an order shows', async () => {
      const { sellerA } = await twoSchools();
      const { agent, listing } = await createListing(sellerA.id, sellerA.email);
      // An order snapshot uses photo 1
      await ctx.prisma.$executeRaw`SELECT 1`;
      const station = await ctx.prisma.pickupStation.create({
        data: {
          institutionId: sellerA.institutionId!,
          name: 'Main Gate',
          address: 'Main Gate',
          contactName: 'Agent',
          contactPhone: '+2348000000000',
          openingHours: [],
        },
      });
      const buyer = await createUser(ctx.prisma, {
        institutionId: sellerA.institutionId,
      });
      const order = await ctx.prisma.order.create({
        data: {
          buyerId: buyer.id,
          institutionId: sellerA.institutionId!,
          pickupStationId: station.id,
          paymentMethod: 'CARD',
          subtotalKobo: 1,
          totalKobo: 1,
          idempotencyKey: randomUUID(),
          status: 'EXPIRED',
          expiresAt: new Date(),
        },
      });
      await ctx.prisma.sellerOrder.create({
        data: {
          orderId: order.id,
          sellerId: sellerA.id,
          code: 'CM-PHOTO1',
          collectionCode: '123456',
          subtotalKobo: 1,
          sellerPayoutKobo: 1,
          fulfillmentStatus: 'CANCELLED',
          items: {
            create: {
              listingId: listing.id,
              titleSnapshot: listing.title,
              imageUrl: photo(sellerA.id, 1).url,
              unitPriceKobo: 1,
              quantity: 1,
            },
          },
        },
      });

      const res = await agent
        .patch(`/api/listings/${listing.id}`)
        .send({ images: [photo(sellerA.id, 3), photo(sellerA.id, 4)] })
        .expect(200);
      expect(
        res.body.data.images.map((i: { publicId: string }) => i.publicId),
      ).toEqual([photo(sellerA.id, 3).publicId, photo(sellerA.id, 4).publicId]);
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(destroy).toHaveBeenCalledWith([photo(sellerA.id, 2).publicId]);
    });

    it('publish, unpublish and archive; drafts only show to their seller', async () => {
      const { sellerA, buyerA } = await twoSchools();
      const { agent, listing } = await createListing(
        sellerA.id,
        sellerA.email,
        {
          status: 'DRAFT',
        },
      );
      const buyer = await signIn(ctx.app, buyerA.email);
      await buyer.get(`/api/listings/${listing.id}`).expect(404);
      await agent.get(`/api/listings/${listing.id}`).expect(200);

      const mine = await agent
        .get('/api/sellers/me/listings?status=DRAFT')
        .expect(200);
      expect(mine.body.data.items.map((i: { id: string }) => i.id)).toEqual([
        listing.id,
      ]);

      await agent
        .patch(`/api/listings/${listing.id}/status`)
        .send({ status: 'ACTIVE' })
        .expect(200);
      await buyer.get(`/api/listings/${listing.id}`).expect(200);
      await agent
        .patch(`/api/listings/${listing.id}/status`)
        .send({ status: 'ARCHIVED' })
        .expect(200);
      await buyer.get(`/api/listings/${listing.id}`).expect(404);
      await agent
        .patch(`/api/listings/${listing.id}/status`)
        .send({ status: 'SOLDOUT' })
        .expect(400);

      await ctx.prisma.listing.update({
        where: { id: listing.id },
        data: { status: 'FLAGGED' },
      });
      const flagged = await agent
        .patch(`/api/listings/${listing.id}/status`)
        .send({ status: 'ACTIVE' })
        .expect(409);
      expect(flagged.body.code).toBe('LISTING_UNDER_REVIEW');
    });

    it('delete is refused while an order is open, then soft-deletes', async () => {
      const { sellerA, buyerA } = await twoSchools();
      const { agent, listing } = await createListing(sellerA.id, sellerA.email);
      const station = await ctx.prisma.pickupStation.create({
        data: {
          institutionId: sellerA.institutionId!,
          name: 'Main Gate',
          address: 'Main Gate',
          contactName: 'Agent',
          contactPhone: '+2348000000000',
          openingHours: [],
        },
      });
      const order = await ctx.prisma.order.create({
        data: {
          buyerId: buyerA.id,
          institutionId: sellerA.institutionId!,
          pickupStationId: station.id,
          paymentMethod: 'CARD',
          subtotalKobo: 1,
          totalKobo: 1,
          idempotencyKey: randomUUID(),
          status: 'PAID',
          expiresAt: new Date(),
        },
      });
      const sellerOrder = await ctx.prisma.sellerOrder.create({
        data: {
          orderId: order.id,
          sellerId: sellerA.id,
          code: 'CM-OPEN01',
          collectionCode: '123456',
          subtotalKobo: 1,
          sellerPayoutKobo: 1,
          fulfillmentStatus: 'AWAITING_DROPOFF',
          escrowStatus: 'HELD',
          items: {
            create: {
              listingId: listing.id,
              titleSnapshot: listing.title,
              unitPriceKobo: 1,
              quantity: 1,
            },
          },
        },
      });

      const refused = await agent
        .delete(`/api/listings/${listing.id}`)
        .expect(409);
      expect(refused.body).toMatchObject({
        code: 'LISTING_HAS_OPEN_ORDERS',
        details: { openOrders: 1 },
      });

      await ctx.prisma.sellerOrder.update({
        where: { id: sellerOrder.id },
        data: { fulfillmentStatus: 'COLLECTED', escrowStatus: 'RELEASED' },
      });
      await agent.delete(`/api/listings/${listing.id}`).expect(204);
      await agent.get(`/api/listings/${listing.id}`).expect(404);
      const row = await ctx.prisma.listing.findUniqueOrThrow({
        where: { id: listing.id },
      });
      expect(row.isDeleted).toBe(true);
    });
  });

  describe('browsing', () => {
    async function catalogue() {
      const { sellerA, buyerA } = await twoSchools();
      const agent = await signIn(ctx.app, sellerA.email);
      const make = async (
        title: string,
        priceKobo: number,
        category = 'TECH',
      ) => {
        const res = await agent
          .post('/api/listings')
          .send(
            listingBody(sellerA.id, {
              title,
              priceKobo,
              category,
              variants: undefined,
              stock: 5,
              description: `${title} in great shape`,
            }),
          )
          .expect(201);
        return res.body.data.id as string;
      };
      const ids = {
        lamp: await make('Desk lamp', 450_000),
        headphones: await make('Study headphones 50% off', 3_200_000),
        kettle: await make('Electric kettle', 1_200_000),
        dress: await make('Ankara dress', 1_800_000, 'FASHION'),
      };
      return { buyer: await signIn(ctx.app, buyerA.email), ids };
    }

    const titles = (res: request.Response) =>
      res.body.data.items.map((i: { title: string }) => i.title);

    it('pages newest first with a cursor', async () => {
      const { buyer } = await catalogue();
      const first = await buyer.get('/api/listings?limit=3').expect(200);
      expect(titles(first)).toEqual([
        'Ankara dress',
        'Electric kettle',
        'Study headphones 50% off',
      ]);
      const second = await buyer
        .get(`/api/listings?limit=3&cursor=${first.body.data.nextCursor}`)
        .expect(200);
      expect(titles(second)).toEqual(['Desk lamp']);
      expect(second.body.data.nextCursor).toBeNull();
    });

    it('sorts by price across pages, and filters by category and price', async () => {
      const { buyer } = await catalogue();
      const first = await buyer
        .get('/api/listings?sort=price_asc&limit=2')
        .expect(200);
      const second = await buyer
        .get(
          `/api/listings?sort=price_asc&limit=2&cursor=${first.body.data.nextCursor}`,
        )
        .expect(200);
      expect([...titles(first), ...titles(second)]).toEqual([
        'Desk lamp',
        'Electric kettle',
        'Ankara dress',
        'Study headphones 50% off',
      ]);
      const desc = await buyer
        .get('/api/listings?sort=price_desc&limit=1')
        .expect(200);
      expect(titles(desc)).toEqual(['Study headphones 50% off']);

      const tech = await buyer
        .get('/api/listings?category=TECH&maxPriceKobo=1500000')
        .expect(200);
      expect(titles(tech).sort()).toEqual(['Desk lamp', 'Electric kettle']);
      await buyer
        .get(`/api/listings?sort=newest&cursor=${first.body.data.nextCursor}`)
        .expect(400); // a price cursor can't page another sort
    });

    it('searches title and description, treating % literally', async () => {
      const { buyer } = await catalogue();
      expect(
        titles(await buyer.get('/api/listings?q=KETTLE').expect(200)),
      ).toEqual(['Electric kettle']);
      expect(
        titles(await buyer.get('/api/listings?q=great%20shape').expect(200)),
      ).toHaveLength(4);
      expect(
        titles(await buyer.get('/api/listings?q=50%25').expect(200)),
      ).toEqual(['Study headphones 50% off']);
      expect(
        titles(await buyer.get('/api/listings?q=%25').expect(200)),
      ).toEqual(['Study headphones 50% off']);
    });

    it("popular orders by the last 7 days' views", async () => {
      const { buyer, ids } = await catalogue();
      const views = async (id: string, daysAgo: number, count: number) =>
        ctx.prisma.$executeRaw`
          INSERT INTO "ListingDailyStat" ("listingId", "date", "views")
          VALUES (${id}, (now() AT TIME ZONE 'Africa/Lagos')::date - ${daysAgo}::int, ${count})`;
      await views(ids.kettle, 1, 30);
      await views(ids.lamp, 0, 10);
      await views(ids.lamp, 3, 10);
      await views(ids.dress, 8, 500); // older than 7 days: ignored

      const page1 = await buyer
        .get('/api/listings?sort=popular&limit=2')
        .expect(200);
      expect(titles(page1)).toEqual(['Electric kettle', 'Desk lamp']);
      const page2 = await buyer
        .get(
          `/api/listings?sort=popular&limit=2&cursor=${page1.body.data.nextCursor}`,
        )
        .expect(200);
      // No views: newest first
      expect(titles(page2)).toEqual([
        'Ankara dress',
        'Study headphones 50% off',
      ]);
      expect(page2.body.data.nextCursor).toBeNull();
    });

    it("records a buyer's view but not the seller's, and lists related items", async () => {
      const { buyer, ids } = await catalogue();
      await buyer.get(`/api/listings/${ids.lamp}`).expect(200);
      await buyer.get(`/api/listings/${ids.lamp}`).expect(200);
      await new Promise((resolve) => setTimeout(resolve, 200));
      const stats = await ctx.prisma.listingDailyStat.findMany({
        where: { listingId: ids.lamp },
      });
      expect(stats.map((s) => s.views)).toEqual([2]);

      const related = await buyer
        .get(`/api/listings/${ids.lamp}/related`)
        .expect(200);
      expect(
        related.body.data.map((i: { title: string }) => i.title).sort(),
      ).toEqual(['Electric kettle', 'Study headphones 50% off']);
    });

    it('an account with no institution sees nothing', async () => {
      await catalogue();
      const admin = await createUser(ctx.prisma, { role: UserRole.ADMIN });
      const agent = await signIn(ctx.app, admin.email);
      const res = await agent.get('/api/listings').expect(200);
      expect(res.body.data).toEqual({ items: [], nextCursor: null });
    });
  });

  describe('store profile and uploads', () => {
    it('a seller reads and edits their store; buyers get 403', async () => {
      const { sellerA, buyerA } = await twoSchools();
      const seller = await signIn(ctx.app, sellerA.email);
      const before = await seller.get('/api/sellers/me').expect(200);
      expect(before.body.data).toMatchObject({
        storeName: null,
        isOnline: false,
      });
      const after = await seller
        .patch('/api/sellers/me')
        .send({ storeName: 'TrendHUB NG', isOnline: true })
        .expect(200);
      expect(after.body.data).toMatchObject({
        storeName: 'TrendHUB NG',
        isOnline: true,
      });
      expect(after.body.data).not.toHaveProperty('paystackRecipientCode');

      await seller
        .patch('/api/sellers/me')
        .send({
          logoUrl: `https://res.cloudinary.com/${CLOUD}/image/upload/v1/campusmart/avatars/someone/logo.png`,
        })
        .expect(400);

      const buyer = await signIn(ctx.app, buyerA.email);
      await buyer.get('/api/sellers/me').expect(403);
      await buyer.get('/api/sellers/me/listings').expect(403);

      // The store name shows on the seller's listings
      const { listing } = await createListing(sellerA.id, sellerA.email);
      const view = await buyer.get(`/api/listings/${listing.id}`).expect(200);
      expect(view.body.data.seller).toMatchObject({
        displayName: 'TrendHUB NG',
        isOnline: true,
      });
    });

    it('signs uploads into your own folder; verification uploads are private', async () => {
      const { buyerA } = await twoSchools();
      const agent = await signIn(ctx.app, buyerA.email);
      const listing = await agent
        .post('/api/uploads/signature')
        .send({ purpose: 'LISTING' })
        .expect(200);
      expect(listing.body.data).toMatchObject({
        cloudName: CLOUD,
        folder: `campusmart/listings/${buyerA.id}`,
      });
      expect(listing.body.data.signature).toMatch(/^[a-f0-9]{40}$/);
      expect(JSON.stringify(listing.body.data)).not.toContain(
        process.env.CLOUDINARY_API_SECRET!,
      );
      const verification = await agent
        .post('/api/uploads/signature')
        .send({ purpose: 'VERIFICATION' })
        .expect(200);
      expect(verification.body.data.type).toBe('authenticated');
      await agent
        .post('/api/uploads/signature')
        .send({ purpose: 'OTHER' })
        .expect(400);
      await request(ctx.app.getHttpServer())
        .post('/api/uploads/signature')
        .send({ purpose: 'LISTING' })
        .expect(401);
    });
  });
});
