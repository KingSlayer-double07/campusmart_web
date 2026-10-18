import { hash } from 'bcrypt';
import { MailService } from '../src/mail/mail.service';
import {
  DeliveryMethod,
  EscrowStatus,
  FulfillmentStatus,
  OrderStatus,
  PayoutStatus,
  UserRole,
} from '../src/generated/prisma/enums';
import { NotificationsService } from '../src/notifications/notifications.service';
import {
  createSchool,
  createSeller,
  createUnpaidOrder,
} from './commerce-fixtures';
import {
  client,
  createTestApp,
  createUser,
  resetRateLimits,
  signIn,
  TEST_PASSWORD,
  TestContext,
  truncateAll,
} from './utils';

// Phase 10: notifications and preferences (T7), the profile, support (T4) and account deletion (T6)
describe('Phase 10 notifications, profile, support and deletion (e2e)', () => {
  let ctx: TestContext;
  let mailSpy: jest.SpyInstance;
  let notifications: NotificationsService;

  beforeAll(async () => {
    ctx = await createTestApp();
    notifications = ctx.app.get(NotificationsService);
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

  const note = (title: string, link?: string) => ({
    type: 'ORDER_PAID',
    title,
    body: `${title} body`,
    ...(link && { link }),
  });

  describe('notifications', () => {
    it('lists your own newest first, counts the unread and marks them read', async () => {
      const ada = await createUser(ctx.prisma);
      const other = await createUser(ctx.prisma);
      await notifications.notify(ada.id, note('First', '/orders/1'), {
        email: false,
      });
      await notifications.notify(ada.id, note('Second'), { email: false });
      await notifications.notify(other.id, note('Not yours'), { email: false });
      const agent = await signIn(ctx.app, ada.email);

      const list = await agent.get('/api/notifications?limit=1').expect(200);
      expect(list.body.data.items).toEqual([
        expect.objectContaining({ title: 'Second', link: null, readAt: null }),
      ]);
      const next = await agent
        .get(`/api/notifications?limit=1&cursor=${list.body.data.nextCursor}`)
        .expect(200);
      expect(next.body.data.items[0]).toMatchObject({
        title: 'First',
        link: '/orders/1',
      });

      const unread = await agent
        .get('/api/notifications/unread-count')
        .expect(200);
      expect(unread.body.data).toEqual({ count: 2 });

      const theirs = await ctx.prisma.notification.findFirstOrThrow({
        where: { userId: other.id },
      });
      const one = await agent
        .post('/api/notifications/read')
        .send({ ids: [next.body.data.items[0].id, theirs.id] })
        .expect(200);
      expect(one.body.data).toEqual({ count: 1 });
      await expect(
        ctx.prisma.notification.findUniqueOrThrow({ where: { id: theirs.id } }),
      ).resolves.toMatchObject({ readAt: null });

      const all = await agent
        .post('/api/notifications/read')
        .send({})
        .expect(200);
      expect(all.body.data).toEqual({ count: 1 });
      expect(
        (await agent.get('/api/notifications/unread-count')).body.data,
      ).toEqual({ count: 0 });

      await agent
        .post('/api/notifications/read')
        .send({ ids: ['nope'] })
        .expect(400);
      await client(ctx.app).get('/api/notifications').expect(401);
    });

    it('order and payment emails can be turned off; admin alerts always go (T7, P10)', async () => {
      const ada = await createUser(ctx.prisma);
      const admin = await createUser(ctx.prisma, { role: UserRole.ADMIN });
      const agent = await signIn(ctx.app, ada.email);
      expect(
        (await agent.get('/api/users/me/notification-preferences')).body.data,
      ).toEqual({
        orderEmails: true,
      });

      await notifications.notify(ada.id, note('Paid'));
      expect(mailSpy).toHaveBeenCalledWith(
        ada.email,
        'notification',
        expect.anything(),
      );

      mailSpy.mockClear();
      await agent
        .patch('/api/users/me/notification-preferences')
        .send({ orderEmails: false })
        .expect(200);
      await notifications.notify(ada.id, note('Paid again'));
      expect(mailSpy).not.toHaveBeenCalled();
      // Still in the app
      expect(
        (await agent.get('/api/notifications/unread-count')).body.data.count,
      ).toBe(2);

      await ctx.prisma.user.update({
        where: { id: admin.id },
        data: { notificationPrefs: { orderEmails: false } },
      });
      await notifications.alertAdmins(note('Alert'));
      expect(mailSpy).toHaveBeenCalledWith(
        admin.email,
        'notification',
        expect.anything(),
      );

      await agent
        .patch('/api/users/me/notification-preferences')
        .send({ orderEmails: 'no' })
        .expect(400);
    });
  });

  describe('profile', () => {
    it('edits the username, names and phone; never the email', async () => {
      const ada = await createUser(ctx.prisma);
      await createUser(ctx.prisma, { email: 'kemi@unilag.edu.ng' });
      await ctx.prisma.user.update({
        where: { email: 'kemi@unilag.edu.ng' },
        data: { username: 'kemi' },
      });
      const agent = await signIn(ctx.app, ada.email);

      const res = await agent
        .patch('/api/users/me/profile')
        .send({
          username: ' Ada_Obi ',
          firstName: 'Ada',
          lastName: '',
          phone: '+234 801 234 5678',
        })
        .expect(200);
      expect(res.body.data).toMatchObject({
        username: 'ada_obi',
        firstName: 'Ada',
        lastName: null,
        phone: '+234 801 234 5678',
      });
      const taken = await agent
        .patch('/api/users/me/profile')
        .send({ username: 'kemi' })
        .expect(409);
      expect(taken.body.code).toBe('USERNAME_TAKEN');
      await agent
        .patch('/api/users/me/profile')
        .send({ username: 'no spaces!' })
        .expect(400);
      await agent
        .patch('/api/users/me/profile')
        .send({ phone: 'call me' })
        .expect(400);
      await agent
        .patch('/api/users/me/profile')
        .send({ email: 'new@unilag.edu.ng' })
        .expect(400);
    });
  });

  describe('support (T4)', () => {
    it('shows no contacts until they are set, so the app says "coming soon"', async () => {
      const res = await client(ctx.app)
        .get('/api/support/contacts')
        .expect(200);
      expect(res.body.data).toEqual({
        email: null,
        phone: null,
        whatsapp: null,
      });
    });

    it('a report reaches the admins’ queue and alerts them', async () => {
      const admin = await createUser(ctx.prisma, { role: UserRole.ADMIN });
      const ada = await createUser(ctx.prisma);
      const agent = await signIn(ctx.app, ada.email);
      const res = await agent
        .post('/api/support/reports')
        .send({ type: 'ORDER', message: 'My order CM-ABC123 never arrived' })
        .expect(201);
      expect(res.body.data.id).toBeTruthy();
      await expect(
        ctx.prisma.notification.count({
          where: { userId: admin.id, type: 'SUPPORT_REPORT' },
        }),
      ).resolves.toBe(1);

      const adminAgent = await signIn(ctx.app, admin.email);
      const queue = await adminAgent
        .get('/api/admin/support-reports?type=ORDER')
        .expect(200);
      expect(queue.body.data.items).toEqual([
        expect.objectContaining({
          type: 'ORDER',
          message: 'My order CM-ABC123 never arrived',
          reporterEmail: ada.email,
          screenshotUrl: null,
        }),
      ]);

      await agent
        .post('/api/support/reports')
        .send({ type: 'LISTING', message: 'A listing is bad' })
        .expect(400);
      await agent
        .post('/api/support/reports')
        .send({ type: 'BUG', message: 'short' })
        .expect(400);
      const bad = await agent
        .post('/api/support/reports')
        .send({
          type: 'BUG',
          message: 'The checkout button does nothing',
          screenshotUrl: 'https://example.com/shot.png',
        })
        .expect(400);
      expect(bad.body.code).toBe('INVALID_IMAGE');
      await client(ctx.app)
        .post('/api/support/reports')
        .send({ type: 'BUG', message: 'The checkout button does nothing' })
        .expect(401);
    });
  });

  describe('account deletion (T6)', () => {
    it('anonymises the account and signs it out; the orders stay', async () => {
      const school = await createSchool(ctx.prisma);
      const seller = await createSeller(ctx.prisma, school.id);
      const buyer = await createUser(ctx.prisma, { institutionId: school.id });
      const order = await createUnpaidOrder(ctx.prisma, buyer, [
        { seller, method: DeliveryMethod.PICKUP },
      ]);
      // A finished, released order
      await ctx.prisma.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.PAID, paidAt: new Date() },
      });
      await ctx.prisma.sellerOrder.updateMany({
        where: { orderId: order.id },
        data: {
          fulfillmentStatus: FulfillmentStatus.COLLECTED,
          escrowStatus: EscrowStatus.RELEASED,
        },
      });
      const agent = await signIn(ctx.app, buyer.email);

      await agent
        .delete('/api/users/me')
        .send({ password: 'Wrong2026x' })
        .expect(401);
      const res = await agent
        .delete('/api/users/me')
        .send({ password: TEST_PASSWORD })
        .expect(204);
      expect(String(res.headers['set-cookie'])).toContain('access_token=;');
      await agent.get('/api/auth/me').expect(401);

      const row = await ctx.prisma.user.findUniqueOrThrow({
        where: { id: buyer.id },
      });
      expect(row).toMatchObject({
        email: `deleted+${buyer.id}@deleted.campusmart.invalid`,
        password: null,
        firstName: null,
        isActive: false,
      });
      expect(row.deletedAt).toBeInstanceOf(Date);
      await expect(
        ctx.prisma.order.count({ where: { buyerId: buyer.id } }),
      ).resolves.toBe(1);
      await client(ctx.app)
        .post('/api/auth/login')
        .send({ email: buyer.email, password: TEST_PASSWORD })
        .expect(401);
      await expect(
        ctx.prisma.auditLog.count({
          where: { entityId: buyer.id, action: 'ACCOUNT_DELETED' },
        }),
      ).resolves.toBe(1);
    });

    it('is refused while an order is on its way, or a payout is unpaid', async () => {
      const school = await createSchool(ctx.prisma);
      const seller = await createSeller(ctx.prisma, school.id);
      const buyer = await createUser(ctx.prisma, { institutionId: school.id });
      const order = await createUnpaidOrder(ctx.prisma, buyer, [
        { seller, method: DeliveryMethod.DISPATCH },
      ]);
      await ctx.prisma.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.PAID, paidAt: new Date() },
      });
      await ctx.prisma.sellerOrder.updateMany({
        where: { orderId: order.id },
        data: {
          fulfillmentStatus: FulfillmentStatus.AWAITING_RIDER,
          escrowStatus: EscrowStatus.HELD,
        },
      });

      const buyerAgent = await signIn(ctx.app, buyer.email);
      const blocked = await buyerAgent
        .delete('/api/users/me')
        .send({ password: TEST_PASSWORD })
        .expect(409);
      expect(blocked.body).toMatchObject({
        code: 'ACCOUNT_HAS_OPEN_ORDERS',
        details: { openOrders: 1 },
      });
      const sellerAgent = await signIn(ctx.app, seller.email);
      await sellerAgent
        .delete('/api/users/me')
        .send({ password: TEST_PASSWORD })
        .expect(409);

      // Finished, but the seller's payout hasn't gone out
      await ctx.prisma.sellerOrder.updateMany({
        where: { orderId: order.id },
        data: {
          fulfillmentStatus: FulfillmentStatus.DELIVERED,
          escrowStatus: EscrowStatus.RELEASED,
        },
      });
      const so = await ctx.prisma.sellerOrder.findFirstOrThrow({
        where: { orderId: order.id },
      });
      await ctx.prisma.payout.create({
        data: {
          sellerOrderId: so.id,
          sellerId: seller.id,
          amountKobo: so.sellerPayoutKobo,
          status: PayoutStatus.FAILED,
          reference: `PO_${so.id}_1`,
        },
      });
      const payout = await sellerAgent
        .delete('/api/users/me')
        .send({ password: TEST_PASSWORD })
        .expect(409);
      expect(payout.body.details).toEqual({ openOrders: 0, openPayouts: 1 });
      await buyerAgent
        .delete('/api/users/me')
        .send({ password: TEST_PASSWORD })
        .expect(204);
    });

    it('a Google account confirms with DELETE; an admin can’t delete themselves', async () => {
      const google = await ctx.prisma.user.create({
        data: {
          email: 'g@gmail.com',
          role: UserRole.BUYER,
          emailVerifiedAt: new Date(),
          googleId: 'g1',
        },
      });
      const admin = await createUser(ctx.prisma, { role: UserRole.ADMIN });
      // Sign the Google user in through a password set just for the test, then remove it
      await ctx.prisma.user.update({
        where: { id: google.id },
        data: { password: await hash(TEST_PASSWORD, 4) },
      });
      const agent = await signIn(ctx.app, google.email);
      await ctx.prisma.user.update({
        where: { id: google.id },
        data: { password: null },
      });
      await agent.delete('/api/users/me').send({}).expect(400);
      await agent
        .delete('/api/users/me')
        .send({ confirm: 'DELETE' })
        .expect(204);

      const adminAgent = await signIn(ctx.app, admin.email);
      const res = await adminAgent
        .delete('/api/users/me')
        .send({ password: TEST_PASSWORD })
        .expect(400);
      expect(res.body.code).toBe('CANNOT_DELETE');
    });
  });

  it('an order waiting for a rider now counts as open when switching a school off', async () => {
    const school = await createSchool(ctx.prisma);
    const seller = await createSeller(ctx.prisma, school.id);
    const buyer = await createUser(ctx.prisma, { institutionId: school.id });
    const order = await createUnpaidOrder(ctx.prisma, buyer, [
      { seller, method: DeliveryMethod.DISPATCH },
    ]);
    await ctx.prisma.order.update({
      where: { id: order.id },
      data: { status: OrderStatus.PAID },
    });
    await ctx.prisma.sellerOrder.updateMany({
      where: { orderId: order.id },
      data: {
        fulfillmentStatus: FulfillmentStatus.AWAITING_RIDER,
        escrowStatus: EscrowStatus.HELD,
      },
    });
    const admin = await createUser(ctx.prisma, { role: UserRole.ADMIN });
    const res = await (
      await signIn(ctx.app, admin.email)
    )
      .patch(`/api/admin/institutions/${school.id}`)
      .send({ isActive: false, reason: 'End of term' })
      .expect(409);
    expect(res.body).toMatchObject({
      code: 'INSTITUTION_HAS_OPEN_ORDERS',
      details: { openOrders: 1 },
    });
  });
});
