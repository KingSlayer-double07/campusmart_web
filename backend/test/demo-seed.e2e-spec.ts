import { seed } from '../prisma/seed';
import { removeDemo, seedDemo } from '../prisma/demo-seed';
import { DEMO_DOMAIN } from '../prisma/demo/data';
import { DeadlinesService } from '../src/dispatch/deadlines.service';
import { OrderExpiryService } from '../src/orders/order-expiry.service';
import { PayoutsService } from '../src/payments/payouts.service';
import { ReviewRemindersService } from '../src/reviews/review-reminders.service';
import {
  createTestApp,
  createUser,
  resetRateLimits,
  signIn,
  TestContext,
  truncateAll,
} from './utils';

const DEMO_PASSWORD = 'DemoPass2026';
const ADMIN = 'admin@campusmart.test';

// The staging demo data (prisma/demo-seed.ts) against the current schema and the real API, so a
// schema or service change that breaks it fails here rather than on the staging database.
describe('Demo seed (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    await truncateAll(ctx.prisma);
    resetRateLimits(ctx.app);
    await seed(ctx.prisma, {
      SEED_ADMIN_EMAIL: ADMIN,
      SEED_ADMIN_PASSWORD: 'SeedAdmin123',
    });
    // Staging's test school, as set up there (2026-10-27)
    await ctx.prisma.institution.create({
      data: {
        name: 'Test University',
        domains: ['gmail.com', 'hotmail.com', 'yahoo.com', 'outlook.com'],
      },
    });
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('fills every major table for one school, with 20 people', async () => {
    const result = await seedDemo(ctx.prisma, { DEMO_PASSWORD });
    expect(result.counts.users).toBe(20);
    const p = ctx.prisma;
    // All of it at Test University; the base seed's University of Lagos gets nothing
    expect(result.school).toBe('Test University');
    const unilag = await p.institution.findUniqueOrThrow({
      where: { name: 'University of Lagos' },
    });
    expect(await p.user.count({ where: { institutionId: unilag.id } })).toBe(0);
    expect(await p.listing.count({ where: { institutionId: unilag.id } })).toBe(
      0,
    );
    const counts = await Promise.all([
      p.sellerProfile.count(),
      p.verificationRequest.count(),
      p.invite.count(),
      p.listing.count(),
      p.listingVariant.count(),
      p.listingDailyStat.count(),
      p.order.count(),
      p.payment.count(),
      p.deliveryJob.count(),
      p.payout.count(),
      p.refund.count(),
      p.dispute.count(),
      p.problemReport.count(),
      p.review.count(),
      p.wishlist.count(),
      p.cartItem.count(),
      p.supportReport.count(),
      p.moderationAction.count(),
      p.notification.count(),
      p.auditLog.count(),
    ]);
    expect(counts.every((n) => n > 0)).toBe(true);
    // Ratings and trust come from the app's own code: the hidden review doesn't count (R4)
    const kitchen = await p.sellerProfile.findFirstOrThrow({
      where: { storeName: "Mama Chi's Kitchen" },
      select: {
        ratingAvg: true,
        ratingCount: true,
        user: { select: { trustScore: true } },
      },
    });
    expect(kitchen).toMatchObject({ ratingAvg: 5, ratingCount: 2 });
    expect(kitchen.user.trustScore).toBeGreaterThan(0);
  });

  it('works through the API for a buyer, a seller, a rider and the admin', async () => {
    await seedDemo(ctx.prisma, { DEMO_PASSWORD });

    const buyer = await signIn(
      ctx.app,
      `ifeoma.eze@${DEMO_DOMAIN}`,
      DEMO_PASSWORD,
    );
    const listings = await buyer.get('/api/listings').expect(200);
    expect(listings.body.data.items.length).toBeGreaterThanOrEqual(20);
    const orders = await buyer.get('/api/orders').expect(200);
    expect(orders.body.data.items.length).toBe(5);
    const wishlist = await buyer.get('/api/wishlist').expect(200);
    expect(wishlist.body.data.items).toHaveLength(3);

    const seller = await signIn(
      ctx.app,
      `emeka.obi@${DEMO_DOMAIN}`,
      DEMO_PASSWORD,
    );
    const stats = await seller
      .get('/api/sellers/me/stats?range=30d')
      .expect(200);
    expect(stats.body.data.views).toBeGreaterThan(0);
    expect(stats.body.data.orders).toBeGreaterThan(0);
    expect(stats.body.data.revenueKobo).toBeGreaterThan(0);
    const payouts = await seller.get('/api/sellers/me/payouts').expect(200);
    expect(payouts.body.data.items.length).toBeGreaterThan(0);

    const rider = await signIn(
      ctx.app,
      `musa.bello@${DEMO_DOMAIN}`,
      DEMO_PASSWORD,
    );
    const open = await rider.get('/api/dispatch/jobs?scope=OPEN').expect(200);
    expect(open.body.data.items).toHaveLength(1);
    const mine = await rider.get('/api/dispatch/jobs?scope=MINE').expect(200);
    expect(mine.body.data.items).toHaveLength(1);

    const admin = await signIn(ctx.app, ADMIN, 'SeedAdmin123');
    const overview = await admin.get('/api/admin/overview').expect(200);
    expect(overview.body.data).toMatchObject({
      openDisputes: 1,
      failedPayouts: 1,
      listingsToReview: 1,
      openReports: 3,
      suspendedUsers: 1,
    });
  });

  it("doesn't set off the background jobs the moment it lands", async () => {
    await seedDemo(ctx.prisma, { DEMO_PASSWORD });
    const now = new Date();
    expect(await ctx.app.get(PayoutsService).releaseDue(now)).toBe(0);
    expect(await ctx.app.get(OrderExpiryService).expireDue(now)).toBe(0);
    expect(await ctx.app.get(ReviewRemindersService).remind(now)).toBe(0);
    expect(await ctx.app.get(DeadlinesService).runAll(now)).toEqual({
      missedPickup: 0,
      notCollected: 0,
      unacceptedAlerts: 0,
      withRiderAlerts: 0,
    });
  });

  it('runs once, and --remove takes out the demo data and nothing else', async () => {
    const tester = await createUser(ctx.prisma, {
      email: 'tester@unilag.edu.ng',
    });
    await seedDemo(ctx.prisma, { DEMO_PASSWORD });
    await expect(seedDemo(ctx.prisma, { DEMO_PASSWORD })).rejects.toThrow(
      /already there/,
    );

    const removed = await removeDemo(ctx.prisma);
    expect(removed).toEqual({ users: 20, listings: 26, orders: 38 });
    const p = ctx.prisma;
    expect(
      await p.user.count({ where: { email: { endsWith: `@${DEMO_DOMAIN}` } } }),
    ).toBe(0);
    expect(await p.order.count()).toBe(0);
    expect(await p.listing.count()).toBe(0);
    expect(await p.notification.count()).toBe(0);
    expect(await p.auditLog.count()).toBe(0);
    // The tester, the admin and the school's places stay
    expect(await p.user.count({ where: { id: tester.id } })).toBe(1);
    expect(await p.user.count({ where: { email: ADMIN } })).toBe(1);
    expect(await p.campusPlace.count()).toBeGreaterThan(10);

    // And it can go in again
    await expect(seedDemo(ctx.prisma, { DEMO_PASSWORD })).resolves.toBeTruthy();
  });

  it('needs a strong DEMO_PASSWORD and the school', async () => {
    await expect(seedDemo(ctx.prisma, {})).rejects.toThrow(/DEMO_PASSWORD/);
    await expect(
      seedDemo(ctx.prisma, { DEMO_PASSWORD: 'short' }),
    ).rejects.toThrow(/at least 8/);
    await expect(
      seedDemo(ctx.prisma, {
        DEMO_PASSWORD,
        DEMO_SCHOOL: 'Nowhere University',
      }),
    ).rejects.toThrow(/No active school/);
  });
});
