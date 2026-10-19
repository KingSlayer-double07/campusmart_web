import { ListingStatus } from '../src/generated/prisma/enums';
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

// Decision 2026-10-19: guests browse listings, search, categories and reviews at a school they
// pick; the cart's checkout, favourites and store pages still need an account.
describe('Phase 10b guest browsing (e2e)', () => {
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
    const schoolA = await fx.createSchool(ctx.prisma);
    const schoolB = await fx.createSchool(ctx.prisma);
    const sellerA = await fx.createSeller(ctx.prisma, schoolA.id);
    const sellerB = await fx.createSeller(
      ctx.prisma,
      schoolB.id,
      'Bola Gadgets',
    );
    const lamp = await fx.createListing(ctx.prisma, sellerA, {
      title: 'Desk lamp',
    });
    const draft = await fx.createListing(ctx.prisma, sellerA, {
      title: 'Draft kettle',
      status: ListingStatus.DRAFT,
    });
    const elsewhere = await fx.createListing(ctx.prisma, sellerB, {
      title: 'Lamp at another school',
    });
    return { schoolA, schoolB, sellerA, lamp, draft, elsewhere };
  }

  const titles = (res: { body: { data: { items: { title: string }[] } } }) =>
    res.body.data.items.map((i) => i.title);

  it('a guest browses the school they picked: active listings only, with search, categories and reviews', async () => {
    const { schoolA, lamp, draft, elsewhere } = await world();
    const guest = client(ctx.app);

    const page = await guest
      .get(`/api/listings?institutionId=${schoolA.id}`)
      .expect(200);
    expect(titles(page)).toEqual(['Desk lamp']);
    const search = await guest
      .get(
        `/api/listings?institutionId=${schoolA.id}&q=lamp&category=TECH&sort=price_asc`,
      )
      .expect(200);
    expect(titles(search)).toEqual(['Desk lamp']);

    const one = await guest
      .get(`/api/listings/${lamp.id}?institutionId=${schoolA.id}`)
      .expect(200);
    expect(one.body.data).toMatchObject({ id: lamp.id, isOwner: false });
    // A guest's look isn't a view (A2 counts signed-in viewers). Views are written in the
    // background, so wait long enough for one to have landed.
    await new Promise((r) => setTimeout(r, 300));
    await expect(ctx.prisma.listingView.count()).resolves.toBe(0);

    await guest
      .get(`/api/listings/${lamp.id}/related?institutionId=${schoolA.id}`)
      .expect(200);
    const reviews = await guest
      .get(`/api/listings/${lamp.id}/reviews?institutionId=${schoolA.id}`)
      .expect(200);
    expect(reviews.body.data).toEqual({ items: [], nextCursor: null });

    // Another school's listing, or a draft, isn't there for this school's guest
    await guest
      .get(`/api/listings/${elsewhere.id}?institutionId=${schoolA.id}`)
      .expect(404);
    await guest
      .get(`/api/listings/${draft.id}?institutionId=${schoolA.id}`)
      .expect(404);
    await guest
      .get(`/api/listings/${draft.id}/reviews?institutionId=${schoolA.id}`)
      .expect(404);
  });

  it('a guest needs a school that exists and is switched on', async () => {
    await world();
    const off = await fx.createSchool(ctx.prisma, false);
    const guest = client(ctx.app);

    const none = await guest.get('/api/listings').expect(401);
    expect(none.body.code).toBe('UNAUTHENTICATED');
    await guest
      .get('/api/listings?institutionId=00000000-0000-4000-8000-000000000000')
      .expect(404);
    const inactive = await guest
      .get(`/api/listings?institutionId=${off.id}`)
      .expect(403);
    expect(inactive.body.code).toBe('INSTITUTION_INACTIVE');
    await guest.get('/api/listings?institutionId=not-a-uuid').expect(400);
    await guest
      .get(`/api/listings?institutionId=${off.id}&extra=1`)
      .expect(400);
  });

  it('checkout, the cart on the server, favourites and store pages still need an account', async () => {
    const { schoolA, sellerA, lamp } = await world();
    const guest = client(ctx.app);
    await guest.get('/api/cart').expect(401);
    await guest
      .put('/api/cart/items')
      .send({ listingId: lamp.id, quantity: 1 })
      .expect(401);
    await guest.post('/api/orders/checkout').send({}).expect(401);
    await guest.get('/api/wishlist').expect(401);
    await guest.put(`/api/wishlist/${lamp.id}`).expect(401);
    // Store pages stay signed in (decision 2026-10-19), whatever school is named
    await guest.get(`/api/stores?institutionId=${schoolA.id}`).expect(401);
    await guest.get(`/api/stores/${sellerA.id}`).expect(401);
  });

  it('signed in, it is always your own school; a session that has ended is a 401 so the app refreshes', async () => {
    const { schoolA, schoolB, lamp } = await world();
    const buyer = await createUser(ctx.prisma, { institutionId: schoolA.id });
    const agent = await signIn(ctx.app, buyer.email);

    const page = await agent
      .get(`/api/listings?institutionId=${schoolB.id}`)
      .expect(200);
    expect(titles(page)).toEqual(['Desk lamp']);
    await agent.get(`/api/listings/${lamp.id}`).expect(200);
    // The view is written in the background; give it a moment
    let views = 0;
    for (let i = 0; i < 20 && views === 0; i++) {
      await new Promise((r) => setTimeout(r, 50));
      views = await ctx.prisma.listingView.count({
        where: { viewerId: buyer.id },
      });
    }
    expect(views).toBe(1);

    // A stale or forged access cookie isn't quietly treated as a guest
    const stale = await client(ctx.app)
      .get(`/api/listings?institutionId=${schoolA.id}`)
      .set('Cookie', 'access_token=expired.or.forged')
      .expect(401);
    expect(stale.body.code).toBe('UNAUTHENTICATED');

    // An account still confirming its email can look around its school too
    const unconfirmed = await createUser(ctx.prisma, {
      institutionId: schoolA.id,
      emailVerifiedAt: null,
    });
    const u = await signIn(ctx.app, unconfirmed.email);
    expect(titles(await u.get('/api/listings').expect(200))).toEqual([
      'Desk lamp',
    ]);
  });
});
