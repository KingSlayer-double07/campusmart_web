import request from 'supertest';
import { ListingStatus, UserRole } from '../src/generated/prisma/enums';
import { createListing, createSchool, createSeller } from './commerce-fixtures';
import {
  createTestApp,
  createUser,
  resetRateLimits,
  signIn,
  TestContext,
  truncateAll,
} from './utils';

// Guide 4.1: the server cart, scoped to the buyer's school
describe('Phase 4 cart (e2e)', () => {
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
    const school = await createSchool(ctx.prisma);
    const other = await createSchool(ctx.prisma);
    const ada = await createSeller(ctx.prisma, school.id, 'Ada Wears');
    const tunde = await createSeller(ctx.prisma, school.id, 'Tunde Tech');
    const buyer = await createUser(ctx.prisma, { institutionId: school.id });
    const lamp = await createListing(ctx.prisma, tunde, {
      title: 'Desk lamp',
      priceKobo: 450_000,
      stock: 2,
    });
    const pants = await createListing(ctx.prisma, ada, {
      title: 'Cargo pants',
      priceKobo: 1_450_000,
      variants: [
        { label: 'M', stock: 2 },
        { label: 'L', stock: 1, priceKobo: 1_500_000 },
      ],
    });
    const agent = await signIn(ctx.app, buyer.email);
    return { school, other, ada, tunde, buyer, lamp, pants, agent };
  }

  const variantId = (
    listing: { variants: { id: string; label: string }[] },
    label: string,
  ) => listing.variants.find((v) => v.label === label)!.id;

  it('adds lines, groups them by seller and totals what can be bought', async () => {
    const { agent, lamp, pants } = await world();
    await agent
      .put('/api/cart/items')
      .send({ listingId: lamp.id, quantity: 2 })
      .expect(200);
    const res = await agent
      .put('/api/cart/items')
      .send({
        listingId: pants.id,
        variantId: variantId(pants, 'L'),
        quantity: 1,
      })
      .expect(200);

    const cart = res.body.data;
    expect(
      cart.groups.map(
        (g: { seller: { storeName: string }; subtotalKobo: number }) => [
          g.seller.storeName,
          g.subtotalKobo,
        ],
      ),
    ).toEqual([
      ['Tunde Tech', 900_000],
      ['Ada Wears', 1_500_000],
    ]);
    expect(cart.subtotalKobo).toBe(2_400_000);
    expect(cart.itemCount).toBe(3);
    expect(cart.issues).toEqual([]);
    expect(cart.groups[1].items[0]).toMatchObject({
      quantity: 1,
      unitPriceKobo: 1_500_000,
      available: true,
      maxQuantity: 1,
      variant: { label: 'L', priceKobo: 1_500_000, stock: 1 },
      listing: { id: pants.id, title: 'Cargo pants' },
    });

    // Setting the absolute quantity replaces it; 0 removes the line
    await agent
      .put('/api/cart/items')
      .send({ listingId: lamp.id, quantity: 1 })
      .expect(200);
    const after = await agent
      .put('/api/cart/items')
      .send({ listingId: lamp.id, quantity: 0 })
      .expect(200);
    expect(after.body.data.groups).toHaveLength(1);
    await expect(ctx.prisma.cartItem.count()).resolves.toBe(1);
  });

  it('refuses what the guide lists: not live, other school, no option, own listing, over stock', async () => {
    const { agent, other, lamp, pants, buyer } = await world();
    const elsewhere = await createSeller(ctx.prisma, other.id, 'Far Away');
    const farLamp = await createListing(ctx.prisma, elsewhere);
    const draft = await createListing(
      ctx.prisma,
      { id: lamp.sellerId, institutionId: lamp.institutionId },
      { status: ListingStatus.DRAFT },
    );
    const soldOut = await createListing(
      ctx.prisma,
      { id: lamp.sellerId, institutionId: lamp.institutionId },
      { status: ListingStatus.SOLDOUT, stock: 0 },
    );

    for (const listingId of [
      farLamp.id,
      draft.id,
      soldOut.id,
      '00000000-0000-4000-8000-000000000000',
    ]) {
      await agent
        .put('/api/cart/items')
        .send({ listingId, quantity: 1 })
        .expect(404);
    }

    const noOption = await agent
      .put('/api/cart/items')
      .send({ listingId: pants.id, quantity: 1 })
      .expect(400);
    expect(noOption.body.code).toBe('VARIANT_REQUIRED');

    const tooMany = await agent
      .put('/api/cart/items')
      .send({ listingId: lamp.id, quantity: 3 })
      .expect(409);
    expect(tooMany.body).toMatchObject({
      code: 'OUT_OF_STOCK',
      details: { available: 2 },
    });

    // A seller shopping can't buy their own listing
    await ctx.prisma.user.update({
      where: { id: buyer.id },
      data: { role: UserRole.SELLER },
    });
    const mine = await createListing(ctx.prisma, {
      id: buyer.id,
      institutionId: buyer.institutionId,
    });
    const own = await agent
      .put('/api/cart/items')
      .send({ listingId: mine.id, quantity: 1 })
      .expect(400);
    expect(own.body.code).toBe('OWN_LISTING');

    // Unknown fields, and prices, are rejected
    await agent
      .put('/api/cart/items')
      .send({ listingId: lamp.id, quantity: 1, priceKobo: 1 })
      .expect(400);
    await expect(ctx.prisma.cartItem.count()).resolves.toBe(0);
  });

  it('holds at most 50 different lines', async () => {
    const { agent, buyer, tunde, lamp } = await world();
    const many = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        createListing(ctx.prisma, tunde, { title: `Item ${i}` }),
      ),
    );
    await ctx.prisma.cartItem.createMany({
      data: many.map((l) => ({
        userId: buyer.id,
        listingId: l.id,
        quantity: 1,
        unitPriceKobo: l.priceKobo,
      })),
    });
    const full = await agent
      .put('/api/cart/items')
      .send({ listingId: lamp.id, quantity: 1 })
      .expect(409);
    expect(full.body.code).toBe('CART_FULL');
    // A line already there can still change
    await agent
      .put('/api/cart/items')
      .send({ listingId: many[0].id, quantity: 2 })
      .expect(200);
  });

  it('warns about price changes, low stock and items that went away', async () => {
    const { agent, lamp, pants } = await world();
    await agent
      .put('/api/cart/items')
      .send({ listingId: lamp.id, quantity: 2 })
      .expect(200);
    await agent
      .put('/api/cart/items')
      .send({
        listingId: pants.id,
        variantId: variantId(pants, 'M'),
        quantity: 2,
      })
      .expect(200);

    await ctx.prisma.listing.update({
      where: { id: lamp.id },
      data: { priceKobo: 500_000 },
    });
    await ctx.prisma.listingVariant.update({
      where: { id: variantId(pants, 'M') },
      data: { stock: 1 },
    });
    const cart = (await agent.get('/api/cart').expect(200)).body.data;
    expect(cart.issues).toEqual([
      expect.objectContaining({
        listingId: lamp.id,
        type: 'PRICE_CHANGED',
        message: 'Price went up from ₦4,500 to ₦5,000',
        previousPriceKobo: 450_000,
        currentPriceKobo: 500_000,
      }),
      expect.objectContaining({
        listingId: pants.id,
        type: 'LOW_STOCK',
        message: 'Only 1 left',
        available: 1,
      }),
    ]);

    // Setting the quantity again takes note of the new price
    const ok = await agent
      .put('/api/cart/items')
      .send({ listingId: lamp.id, quantity: 2 })
      .expect(200);
    expect(ok.body.data.issues.map((i: { type: string }) => i.type)).toEqual([
      'LOW_STOCK',
    ]);

    await ctx.prisma.listing.update({
      where: { id: lamp.id },
      data: { isDeleted: true },
    });
    const gone = (await agent.get('/api/cart').expect(200)).body.data;
    expect(gone.issues[0]).toMatchObject({
      listingId: lamp.id,
      type: 'UNAVAILABLE',
    });
    expect(gone.groups[0].items[0]).toMatchObject({
      available: false,
      maxQuantity: 0,
    });
    expect(gone.subtotalKobo).toBe(2 * 1_450_000);
  });

  it("removes a line by id, but never someone else's", async () => {
    const { agent, lamp, school } = await world();
    const cart = (
      await agent
        .put('/api/cart/items')
        .send({ listingId: lamp.id, quantity: 1 })
        .expect(200)
    ).body.data;
    const lineId = cart.groups[0].items[0].id;

    const stranger = await createUser(ctx.prisma, { institutionId: school.id });
    const s = await signIn(ctx.app, stranger.email);
    await s.delete(`/api/cart/items/${lineId}`).expect(404);
    await agent.delete(`/api/cart/items/${lineId}`).expect(204);
    await agent.delete(`/api/cart/items/${lineId}`).expect(404);
  });

  it('merges the guest cart: larger quantity wins, capped at stock; bad lines are skipped', async () => {
    const { agent, lamp, pants, other } = await world();
    await agent
      .put('/api/cart/items')
      .send({ listingId: lamp.id, quantity: 1 })
      .expect(200);
    const elsewhere = await createSeller(ctx.prisma, other.id, 'Far Away');
    const farLamp = await createListing(ctx.prisma, elsewhere);

    const merged = await agent
      .post('/api/cart/merge')
      .send({
        items: [
          { listingId: lamp.id, quantity: 9 },
          {
            listingId: pants.id,
            variantId: variantId(pants, 'M'),
            quantity: 1,
          },
          { listingId: pants.id, quantity: 1 },
          { listingId: farLamp.id, quantity: 1 },
        ],
      })
      .expect(200);
    const lines = merged.body.data.groups.flatMap(
      (g: {
        items: {
          listing: { id: string };
          quantity: number;
          variant: { label: string } | null;
        }[];
      }) =>
        g.items.map((i) => [
          i.listing.id,
          i.variant?.label ?? null,
          i.quantity,
        ]),
    );
    expect(lines).toEqual([
      [lamp.id, null, 2],
      [pants.id, 'M', 1],
    ]);
  });

  it('needs a verified email and a school that is switched on', async () => {
    const { school, agent } = await world();
    await request(ctx.app.getHttpServer()).get('/api/cart').expect(401);

    const unverified = await createUser(ctx.prisma, {
      institutionId: school.id,
      emailVerifiedAt: null,
    });
    const u = await signIn(ctx.app, unverified.email);
    expect((await u.get('/api/cart').expect(403)).body.code).toBe(
      'EMAIL_NOT_VERIFIED',
    );

    const homeless = await createUser(ctx.prisma, { institutionId: null });
    const h = await signIn(ctx.app, homeless.email);
    expect((await h.get('/api/cart').expect(403)).body.code).toBe(
      'NO_INSTITUTION',
    );

    // Switched off after the buyer signed in: the access token still works, the cart doesn't
    await ctx.prisma.institution.update({
      where: { id: school.id },
      data: { isActive: false },
    });
    expect((await agent.get('/api/cart').expect(403)).body.code).toBe(
      'INSTITUTION_INACTIVE',
    );
  });
});
