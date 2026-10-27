// Demo data for a staging database (asked for 2026-10-27): one school, 20 people and five weeks of
// activity in every major table, so testers and reviewers see a marketplace in use. Not for
// production. Every demo account is on @demo.campusmart.test, which can't receive email, and the
// notifications and audit entries it gives real admins carry `demo: true`; --remove takes it all
// out again, with every order a demo account took part in.
//
// From backend/:
//   DATABASE_URL=... DEMO_PASSWORD=... pnpm run seed:demo      adds the demo data (once)
//   DATABASE_URL=... pnpm run seed:demo -- --remove            removes it
// Needs the school, found by name (DEMO_SCHOOL, default "Test University": the staging school for testers,
// which takes Gmail, Hotmail, Yahoo and Outlook addresses), and an admin.
// The rows are written as the app would have written them, with its own helpers for codes, fees,
// deadlines and refunds; ratings and trust scores are then worked out by the app's own code.
import 'dotenv/config';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import type { ConfigService } from '@nestjs/config';
import { hash } from 'bcrypt';
import { lagosDay } from '../src/analytics/analytics-rules';
import { AuditService } from '../src/audit/audit.service';
import {
  PASSWORD_MESSAGE,
  PASSWORD_RULE,
} from '../src/auth/decorators/is-campusmart-password.decorator';
import { envSchema, type Env } from '../src/config/env';
import { Prisma, PrismaClient } from '../src/generated/prisma/client';
import {
  DeliveryJobStatus,
  DeliveryMethod,
  DisputeStatus,
  EscrowStatus,
  Fault,
  FulfillmentStatus,
  ListingStatus,
  ModerationActionType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PayoutStatus,
  ProblemStatus,
  RefundStatus,
  UserRole,
  VerificationStatus,
} from '../src/generated/prisma/enums';
import {
  collectionCode,
  sellerOrderCode,
  splitFee,
} from '../src/orders/order-codes';
import { formatNairaPlain } from '../src/payments/money';
import {
  fulfilmentOnPayment,
  paymentReference,
  payoutReference,
  refundAmounts,
} from '../src/payments/payment-rules';
import type { PrismaService } from '../src/prisma/prisma.service';
import { recountRatings } from '../src/reviews/review-rules';
import { SettingsService } from '../src/settings/settings.service';
import { TrustService } from '../src/trust/trust.service';
import { describeDatabaseUrl } from './demo/database-url';
import {
  DEMO_BUYERS,
  DEMO_CARTS,
  DEMO_DELIVERY_FEE_KOBO,
  DEMO_DOMAIN,
  DEMO_LISTINGS,
  DEMO_ORDERS,
  DEMO_PLACES,
  DEMO_RIDERS,
  DEMO_SCHOOL,
  DEMO_SELLERS,
  DEMO_WISHLISTS,
  REVIEW_COMMENTS,
  type DemoListing,
  type DemoOrder,
  type DemoPerson,
} from './demo/data';

const HOUR = 3_600_000;
const HANDED_OVER = ['COMPLETED', 'PAYOUT_FAILED', 'IN_WINDOW', 'DISPUTED'];
const RESOLVED = ['DISPUTE_REFUNDED', 'DISPUTE_RELEASED'];
const UNPAID = ['EXPIRED', 'BUYER_CANCELLED'];

const dateFmt = new Intl.DateTimeFormat('en-NG', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'Africa/Lagos',
});

// A fixed sequence, so every run picks the same view counts and review texts
function sequence(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

// Paystack's local card fee: 1.5%, plus ₦100 from ₦2,500, at most ₦2,000
const paystackFee = (kobo: number) =>
  Math.min(Math.floor(kobo * 0.015) + (kobo >= 250_000 ? 10_000 : 0), 200_000);

const demoEmail = (p: DemoPerson) =>
  `${p.firstName}.${p.lastName}@${DEMO_DOMAIN}`.toLowerCase();

// Only the settings the services below read; the database URL and secret aren't used
function settingsConfig(env: NodeJS.ProcessEnv) {
  const keys = [
    'PLATFORM_FEE_BPS',
    'DROP_OFF_DEADLINE_DAYS',
    'BUYER_COLLECT_DAYS',
    'ESCROW_DISPUTE_WINDOW_HOURS',
    'LOW_STOCK_THRESHOLD',
    'TRUST_WEIGHT_RATING',
    'TRUST_WEIGHT_COMPLETED',
    'TRUST_WEIGHT_VERIFIED',
    'TRUST_PENALTY_SELLER_FAULT',
  ];
  const parsed = envSchema.parse({
    ...Object.fromEntries(keys.map((k) => [k, env[k]])),
    NODE_ENV: 'development',
    DATABASE_URL: 'postgresql://unused',
    DIRECT_URL: 'postgresql://unused',
    JWT_SECRET: 'unused-unused-unused-unused-unused',
  });
  return {
    get: (key: keyof Env) => parsed[key],
  } as unknown as ConfigService<Env, true>;
}

function appServices(prisma: PrismaClient, env: NodeJS.ProcessEnv) {
  const db = prisma as unknown as PrismaService;
  const config = settingsConfig(env);
  const settings = new SettingsService(db, config, new AuditService(db));
  return { config, settings, trust: new TrustService(db, settings, config) };
}

export async function seedDemo(
  prisma: PrismaClient,
  env: NodeJS.ProcessEnv = process.env,
  now = new Date(),
) {
  const password = env.DEMO_PASSWORD;
  if (!password) {
    throw new Error('Set DEMO_PASSWORD: every demo account signs in with it.');
  }
  if (!PASSWORD_RULE.test(password)) {
    throw new Error(`DEMO_PASSWORD: ${PASSWORD_MESSAGE}`);
  }
  const schoolName = (env.DEMO_SCHOOL ?? DEMO_SCHOOL).trim();
  const school = await prisma.institution.findFirst({
    where: {
      name: { equals: schoolName, mode: 'insensitive' },
      isActive: true,
    },
  });
  if (!school) {
    throw new Error(
      `No active school named "${schoolName}". Add it in /admin/institutions, or set DEMO_SCHOOL ` +
        'to the name of another one.',
    );
  }
  const admins = await prisma.user.findMany({
    where: { role: UserRole.ADMIN, isActive: true, deletedAt: null },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  if (admins.length === 0) {
    throw new Error('No admin account. Run the base seed first.');
  }
  if (
    await prisma.user.count({
      where: { email: { endsWith: `@${DEMO_DOMAIN}` } },
    })
  ) {
    throw new Error(
      'The demo data is already there. Remove it first with --remove, then run this again.',
    );
  }

  const { config, settings, trust } = appServices(prisma, env);
  const feeBps = await settings.get('platformFeeBps');
  const days = {
    pickupDeadlineDays: await settings.get('pickupDeadlineDays'),
    buyerCollectDays: config.get('BUYER_COLLECT_DAYS', { infer: true }),
  };
  const windowHours = config.get('ESCROW_DISPUTE_WINDOW_HOURS', {
    infer: true,
  });
  const ttlMinutes = config.get('ORDER_PAYMENT_TTL_MINUTES', { infer: true });
  const adminId = admins[0].id;
  const adminIds = admins.map((a) => a.id);
  const passwordHash = await hash(password, 12);
  const random = sequence(20261027);

  const ago = (hours: number) => new Date(now.getTime() - hours * HOUR);
  const plus = (at: Date, hours: number) =>
    new Date(at.getTime() + hours * HOUR);
  // Read two days later, unread when newer
  const readAt = (at: Date) =>
    now.getTime() - at.getTime() > 48 * HOUR
      ? plus(at, 1 + random() * 5)
      : null;

  const rows = {
    places: [] as Prisma.CampusPlaceCreateManyInput[],
    users: [] as Prisma.UserCreateManyInput[],
    profiles: [] as Prisma.SellerProfileCreateManyInput[],
    verifications: [] as Prisma.VerificationRequestCreateManyInput[],
    invites: [] as Prisma.InviteCreateManyInput[],
    listings: [] as Prisma.ListingCreateManyInput[],
    images: [] as Prisma.ListingImageCreateManyInput[],
    variants: [] as Prisma.ListingVariantCreateManyInput[],
    stats: [] as Prisma.ListingDailyStatCreateManyInput[],
    views: [] as Prisma.ListingViewCreateManyInput[],
    orders: [] as Prisma.OrderCreateManyInput[],
    sellerOrders: [] as Prisma.SellerOrderCreateManyInput[],
    items: [] as Prisma.OrderItemCreateManyInput[],
    payments: [] as Prisma.PaymentCreateManyInput[],
    jobs: [] as Prisma.DeliveryJobCreateManyInput[],
    payouts: [] as Prisma.PayoutCreateManyInput[],
    refunds: [] as Prisma.RefundCreateManyInput[],
    disputes: [] as Prisma.DisputeCreateManyInput[],
    problems: [] as Prisma.ProblemReportCreateManyInput[],
    reviews: [] as Prisma.ReviewCreateManyInput[],
    wishlist: [] as Prisma.WishlistCreateManyInput[],
    carts: [] as Prisma.CartItemCreateManyInput[],
    reports: [] as Prisma.SupportReportCreateManyInput[],
    moderation: [] as Prisma.ModerationActionCreateManyInput[],
    notifications: [] as Prisma.NotificationCreateManyInput[],
    audit: [] as Prisma.AuditLogCreateManyInput[],
  };
  const notify = (
    userIds: string | string[],
    at: Date,
    n: { type: string; title: string; body: string; link: string },
  ) => {
    for (const userId of Array.isArray(userIds) ? userIds : [userIds]) {
      rows.notifications.push({
        userId,
        type: n.type,
        title: n.title,
        body: n.body,
        data: { link: n.link, demo: true },
        readAt: readAt(at),
        createdAt: at,
      });
    }
  };
  const audit = (
    at: Date,
    actorId: string | null,
    action: string,
    entityType: string,
    entityId: string,
    meta: Record<string, unknown> = {},
  ) => {
    rows.audit.push({
      actorId,
      action,
      entityType,
      entityId,
      meta: { ...meta, demo: true } as Prisma.InputJsonValue,
      createdAt: at,
    });
  };

  // ── The school: delivery fee and campus places ──
  const deliveryFeeKobo = school.deliveryFeeKobo ?? DEMO_DELIVERY_FEE_KOBO;
  const existingPlaces = await prisma.campusPlace.findMany({
    where: { institutionId: school.id },
    select: { id: true, name: true },
  });
  const placeIds = new Map(existingPlaces.map((p) => [p.name, p.id]));
  for (const name of DEMO_PLACES) {
    if (placeIds.has(name)) continue;
    const id = randomUUID();
    placeIds.set(name, id);
    rows.places.push({
      id,
      name,
      institutionId: school.id,
      createdAt: ago(56 * 24),
    });
    audit(ago(56 * 24), adminId, 'PLACE_CREATED', 'CampusPlace', id, { name });
  }

  // ── People ──
  interface Person {
    id: string;
    key: string;
    name: string;
    email: string;
    phone: string;
    joinedAt: Date;
  }
  const people = new Map<string, Person>();
  let phoneNo = 1000;
  const addPerson = (
    p: DemoPerson,
    role: UserRole,
    extra: Partial<Prisma.UserCreateManyInput> = {},
  ) => {
    const person: Person = {
      id: randomUUID(),
      key: p.key,
      name: `${p.firstName} ${p.lastName}`,
      email: demoEmail(p),
      phone: `+234 800 000 ${(phoneNo += 1)}`,
      joinedAt: ago(p.joinedDaysAgo * 24 + 3),
    };
    people.set(p.key, person);
    rows.users.push({
      id: person.id,
      email: person.email,
      password: passwordHash,
      username: `${p.firstName}_${p.lastName}`.toLowerCase(),
      firstName: p.firstName,
      lastName: p.lastName,
      phone: person.phone,
      role,
      institutionId: school.id,
      emailVerifiedAt: plus(person.joinedAt, 0.1),
      // Nobody can read mail on the demo domain, so the app doesn't try (T7)
      notificationPrefs: { orderEmails: false },
      createdAt: person.joinedAt,
      ...extra,
    });
    return person;
  };
  const person = (key: string) => {
    const found = people.get(key);
    if (!found) throw new Error(`Unknown demo person ${key}`);
    return found;
  };

  const storeNames = new Map<string, string>(); // seller id -> store
  for (const s of DEMO_SELLERS) {
    const p = addPerson(s, UserRole.SELLER, {
      schoolEmail: demoEmail(s),
      schoolEmailVerifiedAt: plus(ago(s.joinedDaysAgo * 24 + 3), 0.2),
      verificationStatus: s.verified
        ? VerificationStatus.VERIFIED
        : VerificationStatus.UNVERIFIED,
    });
    storeNames.set(p.id, s.storeName);
    rows.profiles.push({
      userId: p.id,
      storeName: s.storeName,
      bio: s.bio,
      isOnline: s.isOnline,
      pickupArea: s.pickupArea,
      pickupAddress: s.pickupAddress,
      contactPhone: p.phone,
      allowsPickup: s.allowsPickup,
      ...(s.bank && {
        payoutBankName: s.bank.name,
        payoutBankCode: s.bank.code,
        payoutAccountLast4: s.bank.last4,
        payoutAccountName: p.name.toUpperCase(),
        // Not a real Paystack recipient: a transfer to it fails, so no money can move
        paystackRecipientCode: `RCP_demo_${s.key}`,
        payoutAccountChangedAt: plus(p.joinedAt, 24),
      }),
      createdAt: p.joinedAt,
    });
    if (s.bank) {
      audit(plus(p.joinedAt, 24), p.id, 'PAYOUT_ACCOUNT_SET', 'User', p.id, {
        bank: s.bank.name,
        last4: s.bank.last4,
      });
    }
    if (s.verified) {
      const reviewedAt = plus(p.joinedAt, 20);
      rows.verifications.push({
        userId: p.id,
        status: VerificationStatus.VERIFIED,
        documentUrl: `https://res.cloudinary.com/demo/image/authenticated/campusmart/verification/${p.id}/student-id.jpg`,
        reviewedAt,
        reviewedById: adminId,
        createdAt: plus(p.joinedAt, 2),
      });
      audit(reviewedAt, adminId, 'SELLER_VERIFIED', 'User', p.id);
    }
  }
  for (const r of DEMO_RIDERS) {
    const p = addPerson(r, UserRole.DISPATCH);
    rows.invites.push({
      userId: p.id,
      tokenHash: createHash('sha256').update(randomBytes(32)).digest('hex'),
      invitedById: adminId,
      expiresAt: plus(p.joinedAt, 7 * 24),
      usedAt: plus(p.joinedAt, 2),
      createdAt: p.joinedAt,
    });
    audit(p.joinedAt, adminId, 'RIDER_INVITED', 'User', p.id);
  }
  for (const b of DEMO_BUYERS) {
    const suspendedAt = b.suspended ? ago(3 * 24) : null;
    const p = addPerson(b, UserRole.BUYER, {
      ...(b.suspended && {
        isSuspended: true,
        suspendedAt,
        suspendedReason: b.suspended,
        suspendedById: adminId,
      }),
    });
    if (b.suspended && suspendedAt) {
      rows.moderation.push({
        type: ModerationActionType.SUSPEND_USER,
        reason: b.suspended,
        targetUserId: p.id,
        moderatorId: adminId,
        createdAt: suspendedAt,
      });
      audit(suspendedAt, adminId, 'USER_SUSPENDED', 'User', p.id, {
        reason: b.suspended,
      });
    }
  }
  const sellerIds = DEMO_SELLERS.map((s) => person(s.key).id);
  const riderIds = DEMO_RIDERS.map((r) => person(r.key).id);

  // ── Listings ──
  interface Listed {
    id: string;
    data: DemoListing;
    sellerId: string;
    listedAt: Date;
    variants: Map<string, { id: string; priceKobo: number }>;
  }
  const listings = new Map<string, Listed>();
  for (const l of DEMO_LISTINGS) {
    const id = randomUUID();
    const listedAt = ago(l.listedDaysAgo * 24 + 5);
    const variants = new Map<string, { id: string; priceKobo: number }>();
    for (const v of l.variants ?? []) {
      const variantId = randomUUID();
      variants.set(v.label, {
        id: variantId,
        priceKobo: v.priceKobo ?? l.priceKobo,
      });
      rows.variants.push({
        id: variantId,
        listingId: id,
        label: v.label,
        priceKobo: v.priceKobo ?? null,
        stock: v.stock,
      });
    }
    const status =
      l.state === 'SOLDOUT'
        ? ListingStatus.SOLDOUT
        : l.state === 'ARCHIVED'
          ? ListingStatus.ARCHIVED
          : l.state === 'DRAFT'
            ? ListingStatus.DRAFT
            : l.state === 'REJECTED' || l.state === 'HELD'
              ? ListingStatus.FLAGGED
              : ListingStatus.ACTIVE;
    const sellerId = person(l.seller).id;
    rows.listings.push({
      id,
      title: l.title,
      description: l.description,
      priceKobo: l.priceKobo,
      stock: l.variants
        ? l.variants.reduce((sum, v) => sum + v.stock, 0)
        : (l.stock ?? 0),
      category: l.category,
      condition: l.condition,
      status,
      sellerId,
      institutionId: school.id,
      ...(l.state !== 'DRAFT' && { prohibitedConfirmedAt: listedAt }),
      // A held listing never went live (M4f); the rejected one was live until it was reported
      ...(l.state !== 'DRAFT' &&
        l.state !== 'HELD' && { wentLiveAt: listedAt }),
      ...(l.state === 'HELD' && {
        heldAt: listedAt,
        heldWords: l.heldWords ?? [],
      }),
      ...(l.state === 'REJECTED' && { moderationReason: l.reason }),
      createdAt: listedAt,
    });
    rows.images.push({
      listingId: id,
      url: l.photo,
      publicId: `demo/${l.key}`,
      position: 0,
    });
    listings.set(l.key, { id, data: l, sellerId, listedAt, variants });
  }
  const listing = (key: string) => {
    const found = listings.get(key);
    if (!found) throw new Error(`Unknown demo listing ${key}`);
    return found;
  };

  // ── Orders ──
  const codes = new Set<string>();
  const newCode = () => {
    let code = sellerOrderCode();
    while (codes.has(code)) code = sellerOrderCode();
    codes.add(code);
    return code;
  };
  const sold = new Map<string, number>(); // listing id -> units, for the view counts
  const handedOver: {
    soId: string;
    sellerId: string;
    buyerId: string;
    orderId: string;
    listingIds: string[];
    collectedAt: Date;
    rating: number | null | undefined;
  }[] = [];

  for (const o of DEMO_ORDERS) {
    const buyer = person(o.buyer);
    const placedAt = ago(o.placedHoursAgo);
    const paid = !UNPAID.includes(o.stage);
    const paidAt = paid ? plus(placedAt, 0.05) : null;
    const byDispatch = o.stores.some((s) => s.method === 'DISPATCH');
    const placeId = byDispatch && o.to ? placeIds.get(o.to) : undefined;
    if (byDispatch && o.to && !placeId) {
      throw new Error(`Unknown campus place ${o.to}`);
    }
    const orderId = randomUUID();
    const rider = o.rider ? person(o.rider) : null;

    // When the rider accepted, reached the store, took the parcel and handed it over
    const t: {
      accepted?: Date;
      from?: Date;
      to?: Date;
      picked?: Date;
      collected?: Date;
    } = {};
    if (paidAt && byDispatch && rider) {
      if (o.stage === 'RIDER_ASSIGNED') {
        t.accepted = plus(paidAt, 0.7);
        const from = new Date(
          Math.ceil(plus(now, 1).getTime() / (HOUR / 2)) * (HOUR / 2),
        );
        t.from = from;
        t.to = plus(from, 1);
      } else if (o.stage === 'WITH_RIDER') {
        t.accepted = ago(3);
        t.from = ago(1.5);
        t.to = ago(0.5);
        t.picked = ago(1);
      } else {
        t.accepted = plus(paidAt, 0.7);
        t.from = plus(paidAt, 1.5);
        t.to = plus(paidAt, 2.5);
        t.picked = plus(paidAt, 2);
      }
    }

    let subtotalKobo = 0;
    const stores = o.stores.map((store, index) => {
      const lines = store.lines.map(([key, quantity, label]) => {
        const l = listing(key);
        const variant = label ? l.variants.get(label) : undefined;
        if (label && !variant) throw new Error(`No variant ${label} on ${key}`);
        return {
          l,
          quantity,
          label,
          variantId: variant?.id ?? null,
          unitPriceKobo: variant?.priceKobo ?? l.data.priceKobo,
        };
      });
      const sellerId = lines[0].l.sellerId;
      if (lines.some((line) => line.l.sellerId !== sellerId)) {
        throw new Error('Each store in a demo order sells all its lines');
      }
      const subtotal = lines.reduce(
        (sum, line) => sum + line.unitPriceKobo * line.quantity,
        0,
      );
      subtotalKobo += subtotal;
      return {
        id: randomUUID(),
        index,
        method: DeliveryMethod[store.method],
        sellerId,
        storeName: storeNames.get(sellerId)!,
        lines,
        subtotal,
        code: newCode(),
      };
    });
    const fee = placeId ? deliveryFeeKobo : 0;
    const totalKobo = subtotalKobo + fee;

    rows.orders.push({
      id: orderId,
      buyerId: buyer.id,
      institutionId: school.id,
      campusPlaceId: placeId ?? null,
      deliveryAddress: byDispatch && o.address ? o.address : null,
      buyerPhone: byDispatch ? buyer.phone : null,
      deliveryFeeKobo: fee,
      status:
        o.stage === 'EXPIRED'
          ? OrderStatus.EXPIRED
          : o.stage === 'BUYER_CANCELLED'
            ? OrderStatus.CANCELLED
            : OrderStatus.PAID,
      paymentMethod: PaymentMethod[o.pay ?? 'CARD'],
      subtotalKobo,
      totalKobo,
      idempotencyKey: randomUUID(),
      expiresAt: plus(placedAt, ttlMinutes / 60),
      paidAt,
      createdAt: placedAt,
    });

    let paymentId: string | null = null;
    const feesKobo = paystackFee(totalKobo);
    if (paidAt || o.stage === 'EXPIRED') {
      paymentId = randomUUID();
      rows.payments.push({
        id: paymentId,
        orderId,
        attempt: 1,
        reference: paymentReference(orderId, 1),
        amountKobo: totalKobo,
        // An expired order's payment page was opened and never paid
        status: paidAt ? PaymentStatus.COMPLETED : PaymentStatus.PENDING,
        channel: paidAt
          ? o.pay === 'BANK_TRANSFER'
            ? 'bank_transfer'
            : 'card'
          : null,
        feesKobo: paidAt ? feesKobo : null,
        paidAt,
        createdAt: plus(placedAt, 0.02),
      });
    }
    if (paidAt) {
      audit(paidAt, null, 'ORDER_PAID', 'Order', orderId, {
        reference: paymentReference(orderId, 1),
        amountKobo: totalKobo,
      });
      notify(buyer.id, paidAt, {
        type: 'ORDER_PAID',
        title: 'Payment received',
        body: `We've received ${formatNairaPlain(totalKobo)}. We'll keep you posted as each store gets your order to you.`,
        link: `/orders/${orderId}`,
      });
    }

    // The delivery job: one for every store going by dispatch (DF7)
    let jobId: string | null = null;
    if (paidAt && byDispatch) {
      jobId = randomUUID();
      const status =
        o.stage === 'OPEN_JOB'
          ? DeliveryJobStatus.OPEN
          : o.stage === 'SELLER_CANCELLED'
            ? DeliveryJobStatus.CANCELLED
            : o.stage === 'RIDER_ASSIGNED' || o.stage === 'WITH_RIDER'
              ? DeliveryJobStatus.ASSIGNED
              : DeliveryJobStatus.DONE;
      const assigned =
        status !== DeliveryJobStatus.OPEN &&
        status !== DeliveryJobStatus.CANCELLED;
      if (assigned && !rider)
        throw new Error('A demo dispatch order needs a rider');
      rows.jobs.push({
        id: jobId,
        orderId,
        institutionId: school.id,
        status,
        riderId: assigned ? rider!.id : null,
        acceptedAt: assigned ? t.accepted! : null,
        createdAt: paidAt,
      });
      if (status === DeliveryJobStatus.OPEN) {
        notify(riderIds, paidAt, {
          type: 'NEW_JOB',
          title: 'New delivery job',
          body: 'A new order is ready for a rider. Open it to see where it goes.',
          link: `/dispatch/jobs/${jobId}`,
        });
      }
      if (assigned) {
        audit(t.accepted!, rider!.id, 'JOB_ACCEPTED', 'DeliveryJob', jobId);
        notify(buyer.id, t.accepted!, {
          type: 'RIDER_ASSIGNED',
          title: 'A rider has your order',
          body: `${rider!.name} is collecting your order from the store${stores.length > 1 ? 's' : ''} and will bring it to you.`,
          link: `/orders/${orderId}`,
        });
      }
    }

    for (const so of stores) {
      const isDispatch = so.method === DeliveryMethod.DISPATCH;
      const onPayment = paidAt
        ? fulfilmentOnPayment(so.method, paidAt, days)
        : null;
      const collectedAt = isDispatch
        ? t.picked
          ? plus(t.picked, 1)
          : undefined
        : paidAt
          ? plus(paidAt, 20)
          : undefined;
      const handed =
        HANDED_OVER.includes(o.stage) || RESOLVED.includes(o.stage);
      const releaseAt =
        handed && collectedAt ? plus(collectedAt, windowHours) : null;
      const remindAt = handed && collectedAt ? plus(collectedAt, 24) : null;

      let fulfillmentStatus: FulfillmentStatus = FulfillmentStatus.PENDING;
      let escrowStatus: EscrowStatus = paidAt
        ? EscrowStatus.HELD
        : EscrowStatus.PENDING;
      let cancelledAt: Date | null = null;
      let cancelReason: string | null = null;
      let fault: Fault | null = null;
      if (onPayment) fulfillmentStatus = onPayment.fulfillmentStatus;
      if (isDispatch && o.stage === 'RIDER_ASSIGNED') {
        fulfillmentStatus = FulfillmentStatus.RIDER_ASSIGNED;
      }
      if (isDispatch && o.stage === 'WITH_RIDER') {
        fulfillmentStatus = FulfillmentStatus.WITH_RIDER;
      }
      if (handed) {
        fulfillmentStatus = isDispatch
          ? FulfillmentStatus.DELIVERED
          : FulfillmentStatus.COLLECTED;
      }
      if (o.stage === 'DISPUTED')
        fulfillmentStatus = FulfillmentStatus.DISPUTED;
      if (o.stage === 'EXPIRED' || o.stage === 'BUYER_CANCELLED') {
        fulfillmentStatus = FulfillmentStatus.CANCELLED;
        cancelledAt =
          o.stage === 'EXPIRED'
            ? plus(placedAt, ttlMinutes / 60 + 0.02)
            : plus(placedAt, 0.2);
        cancelReason =
          o.stage === 'EXPIRED' ? 'PAYMENT_EXPIRED' : 'BUYER_CANCELLED';
      }

      // Disputes (F6): opened 8 hours after handover, decided a day later
      let resolvedAt: Date | null = null;
      if (o.dispute && collectedAt) {
        const opened = plus(collectedAt, o.stage === 'DISPUTED' ? 10 : 8);
        resolvedAt = RESOLVED.includes(o.stage) ? plus(collectedAt, 30) : null;
        const disputeId = randomUUID();
        rows.disputes.push({
          id: disputeId,
          sellerOrderId: so.id,
          openedById: buyer.id,
          reason: o.dispute.reason,
          details: o.dispute.details,
          evidenceUrls: [],
          status:
            o.stage === 'DISPUTE_REFUNDED'
              ? DisputeStatus.RESOLVED_REFUND
              : o.stage === 'DISPUTE_RELEASED'
                ? DisputeStatus.RESOLVED_RELEASE
                : DisputeStatus.OPEN,
          fault: o.stage === 'DISPUTE_REFUNDED' ? Fault.SELLER : null,
          resolutionNote: resolvedAt ? o.dispute.note : null,
          resolvedById: resolvedAt ? adminId : null,
          resolvedAt,
          createdAt: opened,
        });
        audit(opened, buyer.id, 'DISPUTE_OPENED', 'SellerOrder', so.id, {
          disputeId,
          reason: o.dispute.reason,
        });
        notify(adminIds, opened, {
          type: 'DISPUTE_OPENED',
          title: `Dispute on ${so.code}`,
          body: `The buyer says: ${o.dispute.reason.replaceAll('_', ' ').toLowerCase()}. The payout is on hold until you decide.`,
          link: `/admin/disputes/${disputeId}`,
        });
        notify(so.sellerId, opened, {
          type: 'DISPUTE_OPENED',
          title: `The buyer reported a problem with ${so.code}`,
          body: 'Your payout for it is on hold while CampusMart looks into it.',
          link: `/sellers/orders/${so.id}`,
        });
        if (resolvedAt) {
          const refunded = o.stage === 'DISPUTE_REFUNDED';
          audit(resolvedAt, adminId, 'DISPUTE_RESOLVED', 'SellerOrder', so.id, {
            disputeId,
            outcome: refunded ? 'REFUND' : 'RELEASE',
          });
          for (const [userId, link] of [
            [buyer.id, `/orders/${orderId}`],
            [so.sellerId, `/sellers/orders/${so.id}`],
          ]) {
            notify(userId, resolvedAt, {
              type: 'DISPUTE_RESOLVED',
              title: `Decision on ${so.code}`,
              body: refunded
                ? 'CampusMart refunded the buyer.'
                : 'CampusMart found no fault, and the payout goes ahead.',
              link,
            });
          }
        }
      }

      // Refunds: a dispute decided for the buyer, or the seller cancelling before collection
      if (
        paidAt &&
        paymentId &&
        (o.stage === 'DISPUTE_REFUNDED' || o.stage === 'SELLER_CANCELLED')
      ) {
        const at =
          o.stage === 'SELLER_CANCELLED' ? plus(paidAt, 5) : resolvedAt!;
        fulfillmentStatus = FulfillmentStatus.CANCELLED;
        escrowStatus = EscrowStatus.REFUNDED;
        cancelledAt = at;
        cancelReason =
          o.stage === 'SELLER_CANCELLED'
            ? 'SELLER_CANCELLED'
            : 'DISPUTE_REFUND';
        fault = Fault.SELLER;
        const amounts = refundAmounts({
          itemsKobo: so.subtotal,
          orderSubtotalKobo: subtotalKobo,
          paystackFeesKobo: feesKobo,
          fault: Fault.SELLER,
          // Nothing was picked up when the seller cancelled, so the fee goes back too (DF5)
          deliveryFeeKobo: o.stage === 'SELLER_CANCELLED' ? fee : 0,
        });
        const refundId = randomUUID();
        rows.refunds.push({
          id: refundId,
          paymentId,
          sellerOrderId: so.id,
          ...amounts,
          fault: Fault.SELLER,
          reason: cancelReason,
          status: RefundStatus.PROCESSED,
          paystackRefundId: `demo_${refundId}`,
          actorId: o.stage === 'SELLER_CANCELLED' ? so.sellerId : adminId,
          createdAt: at,
        });
        audit(
          at,
          o.stage === 'SELLER_CANCELLED' ? so.sellerId : adminId,
          'REFUND_CREATED',
          'SellerOrder',
          so.id,
          {
            refundId,
            ...amounts,
            fault: Fault.SELLER,
            reason: cancelReason,
          },
        );
        notify(buyer.id, at, {
          type: 'ORDER_REFUNDED',
          title: `Refund for order ${so.code}`,
          body: `${formatNairaPlain(amounts.amountKobo)} is on its way back to you. Banks usually take a few working days.`,
          link: `/orders/${orderId}`,
        });
      }

      // Payouts: 48 hours after handover (or when a dispute is decided for the seller)
      if (
        (o.stage === 'COMPLETED' ||
          o.stage === 'PAYOUT_FAILED' ||
          o.stage === 'DISPUTE_RELEASED') &&
        releaseAt
      ) {
        escrowStatus = EscrowStatus.RELEASED;
        const releasedAt =
          o.stage === 'DISPUTE_RELEASED' ? resolvedAt! : plus(releaseAt, 0.1);
        const payoutId = randomUUID();
        const { sellerPayoutKobo } = splitFee(so.subtotal, feeBps);
        const failed = o.stage === 'PAYOUT_FAILED';
        const paidOutAt = plus(releasedAt, 0.25);
        rows.payouts.push({
          id: payoutId,
          sellerOrderId: so.id,
          sellerId: so.sellerId,
          amountKobo: sellerPayoutKobo,
          status: failed ? PayoutStatus.FAILED : PayoutStatus.PAID,
          attempt: 1,
          reference: payoutReference(so.id, 1),
          transferCode: `TRF_demo_${randomBytes(5).toString('hex')}`,
          failureReason: failed
            ? 'The destination bank is not available'
            : null,
          paidAt: failed ? null : paidOutAt,
          createdAt: releasedAt,
        });
        audit(
          releasedAt,
          o.stage === 'DISPUTE_RELEASED' ? adminId : null,
          'ESCROW_RELEASED',
          'SellerOrder',
          so.id,
          {
            payoutId,
            amountKobo: sellerPayoutKobo,
            status: PayoutStatus.PENDING,
          },
        );
        audit(plus(releasedAt, 0.05), null, 'PAYOUT_SENT', 'Payout', payoutId, {
          reference: payoutReference(so.id, 1),
        });
        if (failed) {
          audit(paidOutAt, null, 'PAYOUT_FAILED', 'Payout', payoutId, {
            reason: 'The destination bank is not available',
          });
          notify(adminIds, paidOutAt, {
            type: 'PAYOUT_FAILED',
            title: 'A payout failed',
            body: `${formatNairaPlain(sellerPayoutKobo)} couldn't be sent: The destination bank is not available. Retry it from Payouts.`,
            link: '/admin/payouts',
          });
        } else {
          audit(paidOutAt, null, 'PAYOUT_PAID', 'Payout', payoutId);
          notify(so.sellerId, paidOutAt, {
            type: 'PAYOUT_PAID',
            title: 'Payout sent',
            body: `${formatNairaPlain(sellerPayoutKobo)} is on its way to your bank account.`,
            link: '/sellers/earnings',
          });
        }
      }

      rows.sellerOrders.push({
        id: so.id,
        orderId,
        sellerId: so.sellerId,
        code: so.code,
        collectionCode: collectionCode(),
        deliveryMethod: so.method,
        fulfillmentStatus,
        pickupDeadline: onPayment?.pickupDeadline ?? null,
        fault,
        escrowStatus,
        subtotalKobo: so.subtotal,
        ...splitFee(so.subtotal, feeBps),
        arrivalFrom:
          isDispatch &&
          t.from &&
          fulfillmentStatus !== FulfillmentStatus.AWAITING_RIDER
            ? t.from
            : null,
        arrivalTo:
          isDispatch &&
          t.to &&
          fulfillmentStatus !== FulfillmentStatus.AWAITING_RIDER
            ? t.to
            : null,
        pickedUpAt: isDispatch && t.picked ? t.picked : null,
        collectedAt: handed ? (collectedAt ?? null) : null,
        releaseAt,
        reviewReminderAt: remindAt && remindAt < now ? remindAt : null,
        cancelledAt,
        cancelReason,
        createdAt: new Date(placedAt.getTime() + so.index),
      });
      for (const line of so.lines) {
        rows.items.push({
          sellerOrderId: so.id,
          listingId: line.l.id,
          variantId: line.variantId,
          titleSnapshot: line.l.data.title,
          variantLabel: line.label ?? null,
          imageUrl: line.l.data.photo,
          unitPriceKobo: line.unitPriceKobo,
          quantity: line.quantity,
        });
        if (paidAt && fulfillmentStatus !== FulfillmentStatus.CANCELLED) {
          sold.set(line.l.id, (sold.get(line.l.id) ?? 0) + line.quantity);
        }
      }

      // What the seller heard, step by step
      if (paidAt) {
        const by = onPayment?.pickupDeadline;
        notify(so.sellerId, paidAt, {
          type: 'NEW_ORDER',
          title: `New order ${so.code}`,
          body: isDispatch
            ? `A CampusMart rider will collect it from you by ${by ? dateFmt.format(by) : 'soon'}. You'll see when they're coming once one accepts.`
            : `The buyer will collect it from you by ${by ? dateFmt.format(by) : 'soon'}. Ask for their code when they come.`,
          link: '/sellers/orders',
        });
      }
      if (isDispatch && rider && t.accepted && t.from && t.to && jobId) {
        notify(so.sellerId, t.accepted, {
          type: 'RIDER_ASSIGNED',
          title: `A rider is coming for ${so.code}`,
          body: `${rider.name} will collect it between ${timeFmt(t.from)} and ${timeFmt(t.to)}. Have it packed, and give them the code ${so.code} when they arrive.`,
          link: `/sellers/orders/${so.id}`,
        });
      }
      if (isDispatch && rider && t.picked) {
        audit(t.picked, rider.id, 'PARCEL_PICKED_UP', 'SellerOrder', so.id);
        notify(so.sellerId, t.picked, {
          type: 'PARCEL_WITH_RIDER',
          title: `${so.code} picked up`,
          body: `${rider.name} has collected it.`,
          link: `/sellers/orders/${so.id}`,
        });
        notify(buyer.id, t.picked, {
          type: 'PARCEL_WITH_RIDER',
          title: `Your order from ${so.storeName} is on its way`,
          body: `${rider.name} has it. Give them your code when it reaches you, and not before.`,
          link: `/orders/${orderId}`,
        });
      }
      if (handed && collectedAt) {
        audit(
          collectedAt,
          isDispatch ? rider!.id : so.sellerId,
          'ORDER_HANDED_OVER',
          'SellerOrder',
          so.id,
          {
            by: isDispatch ? 'RIDER' : 'SELLER',
          },
        );
        notify(buyer.id, collectedAt, {
          type: 'ORDER_HANDED_OVER',
          title: `Order ${so.code} handed over`,
          body: `Enjoy! If something's wrong with it, report a problem within ${windowHours} hours.`,
          link: `/orders/${orderId}`,
        });
        notify(so.sellerId, collectedAt, {
          type: 'ORDER_HANDED_OVER',
          title: `Order ${so.code} reached the buyer`,
          body: `Your payout follows in ${windowHours} hours unless the buyer reports a problem.`,
          link: `/sellers/orders/${so.id}`,
        });
        if (
          o.stage === 'COMPLETED' ||
          o.stage === 'PAYOUT_FAILED' ||
          o.stage === 'DISPUTE_RELEASED'
        ) {
          handedOver.push({
            soId: so.id,
            sellerId: so.sellerId,
            buyerId: buyer.id,
            orderId,
            listingIds: so.lines.map((line) => line.l.id),
            collectedAt,
            rating: o.rating,
          });
        }
      }
    }

    // Problems reported before handover (C8)
    if (o.problem) {
      const at =
        o.problem.by === 'rider' && t.picked ? plus(t.picked, 0.5) : ago(0.5);
      const closed = o.problem.closedNote ? plus(at, 1) : null;
      const reporter = o.problem.by === 'rider' ? rider! : buyer;
      rows.problems.push({
        orderId,
        sellerOrderId: o.problem.by === 'buyer' ? stores[0].id : null,
        reporterId: reporter.id,
        reporterRole:
          o.problem.by === 'rider' ? UserRole.DISPATCH : UserRole.BUYER,
        reason: o.problem.reason,
        details: o.problem.details,
        status: closed ? ProblemStatus.CLOSED : ProblemStatus.OPEN,
        resolutionNote: o.problem.closedNote ?? null,
        resolvedById: closed ? adminId : null,
        resolvedAt: closed,
        createdAt: at,
      });
      notify(adminIds, at, {
        type: 'PROBLEM_REPORTED',
        title:
          o.problem.reason === 'BUYER_NO_SHOW'
            ? 'A buyer didn’t show for a delivery'
            : `Problem reported on ${stores[0].code}`,
        body:
          o.problem.by === 'rider'
            ? `${reporter.name}: ${o.problem.details}`
            : `The buyer says: ${o.problem.details}`,
        link: '/admin/disputes?tab=PROBLEMS',
      });
      if (closed) audit(closed, adminId, 'PROBLEM_CLOSED', 'Order', orderId);
    }
  }

  // ── Reviews: most handed-over orders, in the buyer's own words ──
  const defaultRatings = [5, 4, 5, 5, 4, 3, 5];
  let nextRating = 0;
  const reviewed = new Set<string>();
  for (const h of handedOver) {
    // Left unrated: the buyer got the 24-hour reminder (guide 8.4)
    if (h.rating === null) {
      if (plus(h.collectedAt, 24) < now) {
        notify(h.buyerId, plus(h.collectedAt, 24), {
          type: 'REVIEW_REMINDER',
          title: `How was your order from ${storeNames.get(h.sellerId)}?`,
          body: 'Rate what you received. It helps other students choose.',
          link: `/orders/${h.orderId}#rate`,
        });
      }
      continue;
    }
    const rating =
      h.rating ?? defaultRatings[nextRating++ % defaultRatings.length];
    for (const [i, listingId] of h.listingIds.entries()) {
      const createdAt = plus(h.collectedAt, 6 + i * 2 + random() * 20);
      if (createdAt > now) continue;
      const hidden = rating === 1;
      const comments = REVIEW_COMMENTS[rating] ?? [];
      const reviewId = randomUUID();
      rows.reviews.push({
        id: reviewId,
        rating,
        comment: hidden
          ? 'Worst food ever and a useless seller. Total waste of money!!!'
          : comments[Math.floor(random() * comments.length)],
        reviewerId: h.buyerId,
        revieweeId: h.sellerId,
        listingId,
        sellerOrderId: h.soId,
        createdAt,
        // Decision R4: an admin hid an abusive review; it doesn't count or show
        ...(hidden && {
          hiddenAt: plus(createdAt, 5),
          hiddenById: adminId,
          hiddenReason: 'Abusive, and the photos show the order as described',
        }),
      });
      if (hidden) {
        audit(
          plus(createdAt, 5),
          adminId,
          'REVIEW_HIDDEN',
          'Review',
          reviewId,
          {
            reason: 'Abusive, and the photos show the order as described',
          },
        );
      }
      reviewed.add(`${listingId}|${h.sellerId}`);
    }
  }

  // ── Views: daily counts since each listing went up (A2), and today's viewers ──
  const today = lagosDay(now);
  for (const l of listings.values()) {
    if (l.data.state === 'DRAFT' || l.data.state === 'HELD') continue;
    const base = 3 + 2 * (sold.get(l.id) ?? 0);
    const firstDay = lagosDay(l.listedAt);
    for (let d = 0; ; d += 1) {
      const date = new Date(
        Date.parse(`${firstDay}T00:00:00Z`) + d * 24 * HOUR,
      );
      const day = date.toISOString().slice(0, 10);
      if (day > today) break;
      const recent =
        Date.parse(`${today}T00:00:00Z`) - date.getTime() < 7 * 24 * HOUR;
      const views = Math.round(
        base * (0.4 + random() * 1.2) * (recent ? 1.3 : 1),
      );
      if (views > 0) rows.stats.push({ listingId: l.id, date, views });
    }
  }
  const buyers = DEMO_BUYERS.filter((b) => !b.suspended).map((b) =>
    person(b.key),
  );
  const live = [...listings.values()].filter((l) => !l.data.state);
  for (const [i, b] of buyers.entries()) {
    for (const l of [live[i % live.length], live[(i * 7 + 3) % live.length]]) {
      rows.views.push({
        listingId: l.id,
        viewerId: b.id,
        date: new Date(`${today}T00:00:00Z`),
      });
    }
  }
  const seenToday = new Set<string>();
  rows.views = rows.views.filter((v) => {
    const key = `${v.listingId}|${v.viewerId}`;
    if (seenToday.has(key)) return false;
    seenToday.add(key);
    return true;
  });

  // ── Favourites and carts ──
  for (const [key, keys] of Object.entries(DEMO_WISHLISTS)) {
    const b = person(key);
    for (const [i, key] of keys.entries()) {
      const l = listing(key);
      const after = Math.max(b.joinedAt.getTime(), l.listedAt.getTime());
      rows.wishlist.push({
        userId: b.id,
        listingId: l.id,
        createdAt: plus(new Date(after), 24 + i * 30),
      });
    }
  }
  for (const [key, lines] of Object.entries(DEMO_CARTS)) {
    const b = person(key);
    for (const [l, quantity, label] of lines) {
      const found = listing(l);
      const variant = label ? found.variants.get(label) : undefined;
      rows.carts.push({
        userId: b.id,
        listingId: found.id,
        variantId: variant?.id ?? null,
        variantKey: variant?.id ?? '',
        quantity,
        unitPriceKobo: variant?.priceKobo ?? found.data.priceKobo,
        createdAt: ago(5 + random() * 30),
      });
    }
  }

  // ── Reports, moderation and alerts (Phase 9) ──
  const report = (
    by: string,
    hoursAgo: number,
    r: {
      type: string;
      message: string;
      reason?: string;
      listing?: string;
      closed?: string;
    },
  ) => {
    const at = ago(hoursAgo);
    const reportId = randomUUID();
    const closedAt = r.closed ? plus(at, 6) : null;
    rows.reports.push({
      id: reportId,
      userId: person(by).id,
      type: r.type,
      reason: r.reason ?? null,
      message: r.message,
      listingId: r.listing ? listing(r.listing).id : null,
      status: closedAt ? 'CLOSED' : 'OPEN',
      resolvedAt: closedAt,
      resolvedById: closedAt ? adminId : null,
      resolutionNote: r.closed ?? null,
      createdAt: at,
    });
    if (closedAt)
      audit(closedAt, adminId, 'REPORT_CLOSED', 'SupportReport', reportId);
  };
  report('zainab', 50, {
    type: 'LISTING',
    reason: 'MISLEADING',
    listing: 'tees',
    message: 'The tees I got were faded, not like the photo.',
  });
  report('uche', 20, {
    type: 'LISTING',
    reason: 'MISLEADING',
    listing: 'tees',
    message: 'The photo shows new shirts, but the listing says thrifted.',
  });
  report('david', 12 * 24, {
    type: 'LISTING',
    reason: 'COUNTERFEIT',
    listing: 'earbuds',
    message: 'Are these original? The case looks different from the brand’s.',
    closed:
      'They’re sold as a generic brand, not as a copy of one. Nothing to remove.',
  });
  report('sarah', 8 * 24 + 20, {
    type: 'LISTING',
    reason: 'PROHIBITED_ITEM',
    listing: 'eye-drops',
    message: 'Prescription medicine',
    closed: 'Listing taken down: medicines aren’t allowed.',
  });
  report('bisola', 4 * 24, {
    type: 'BUG',
    message: 'Searching “powerbank” finds nothing; “power bank” works.',
  });
  report('tunde', 5 * 24, {
    type: 'ORDER',
    message: 'I paid by transfer but my order says expired.',
    closed:
      'No payment reached Paystack for this order. Asked Tunde to order again.',
  });

  const eyeDrops = listing('eye-drops');
  const rejectedAt = ago(8 * 24 + 14);
  audit(
    ago(8 * 24 + 20),
    person('sarah').id,
    'LISTING_HIDDEN_BY_REPORT',
    'Listing',
    eyeDrops.id,
  );
  rows.moderation.push({
    type: ModerationActionType.REJECT,
    reason: eyeDrops.data.reason,
    listingId: eyeDrops.id,
    moderatorId: adminId,
    createdAt: rejectedAt,
  });
  audit(rejectedAt, adminId, 'LISTING_MODERATED', 'Listing', eyeDrops.id, {
    action: 'REJECT',
    reason: eyeDrops.data.reason,
  });
  notify(eyeDrops.sellerId, rejectedAt, {
    type: 'LISTING_REJECTED',
    title: 'Your listing was taken down',
    body: `"${eyeDrops.data.title}" was taken down: ${eyeDrops.data.reason}. Edit it to send it for review again.`,
    link: `/sellers/products/${eyeDrops.id}`,
  });
  const held = listing('smartwatch');
  notify(adminIds, held.listedAt, {
    type: 'LISTING_HELD',
    title: 'A listing is waiting for review',
    body: `"${held.data.title}" uses: ${(held.data.heldWords ?? []).join(', ')}`,
    link: '/admin/listings',
  });
  // Both stores already have items at 5 or fewer, and were told (Phase 7)
  for (const key of ['tolu', 'emeka']) {
    const at = ago(2 * 24);
    notify(person(key).id, at, {
      type: 'LOW_STOCK',
      title: 'Some items are running low',
      body: 'Some of your items have 5 or fewer left. Restock so buyers can keep ordering.',
      link: '/sellers/analytics#stock',
    });
  }

  // ── Write it all in one transaction, then let the app work out ratings and trust ──
  await prisma.$transaction([
    ...(school.deliveryFeeKobo === null
      ? [
          prisma.institution.update({
            where: { id: school.id },
            data: { deliveryFeeKobo },
          }),
        ]
      : []),
    prisma.campusPlace.createMany({ data: rows.places }),
    prisma.user.createMany({ data: rows.users }),
    prisma.sellerProfile.createMany({ data: rows.profiles }),
    prisma.sellerProfile.updateMany({
      where: { userId: { in: ['tolu', 'emeka'].map((k) => person(k).id) } },
      data: { lowStockAlertedAt: ago(2 * 24) },
    }),
    prisma.verificationRequest.createMany({ data: rows.verifications }),
    prisma.invite.createMany({ data: rows.invites }),
    prisma.listing.createMany({ data: rows.listings }),
    prisma.listingImage.createMany({ data: rows.images }),
    prisma.listingVariant.createMany({ data: rows.variants }),
    prisma.listingDailyStat.createMany({ data: rows.stats }),
    prisma.listingView.createMany({ data: rows.views }),
    prisma.order.createMany({ data: rows.orders }),
    prisma.sellerOrder.createMany({ data: rows.sellerOrders }),
    prisma.orderItem.createMany({ data: rows.items }),
    prisma.payment.createMany({ data: rows.payments }),
    prisma.deliveryJob.createMany({ data: rows.jobs }),
    prisma.payout.createMany({ data: rows.payouts }),
    prisma.refund.createMany({ data: rows.refunds }),
    prisma.dispute.createMany({ data: rows.disputes }),
    prisma.problemReport.createMany({ data: rows.problems }),
    prisma.review.createMany({ data: rows.reviews }),
    prisma.wishlist.createMany({ data: rows.wishlist }),
    prisma.cartItem.createMany({ data: rows.carts }),
    prisma.supportReport.createMany({ data: rows.reports }),
    prisma.moderationAction.createMany({ data: rows.moderation }),
    prisma.notification.createMany({ data: rows.notifications }),
    prisma.auditLog.createMany({ data: rows.audit }),
  ]);
  for (const pair of reviewed) {
    const [listingId, sellerId] = pair.split('|');
    await recountRatings(
      prisma as unknown as Prisma.TransactionClient,
      listingId,
      sellerId,
    );
  }
  await trust.recalculate(now);

  return {
    school: school.name,
    deliveryFeeSet: school.deliveryFeeKobo === null,
    placesAdded: rows.places.length,
    sellers: DEMO_SELLERS.map((s) => ({
      email: person(s.key).email,
      store: s.storeName,
    })),
    riders: DEMO_RIDERS.map((r) => person(r.key).email),
    buyers: DEMO_BUYERS.map((b) => person(b.key).email),
    counts: {
      users: rows.users.length,
      listings: rows.listings.length,
      orders: rows.orders.length,
      sellerOrders: rows.sellerOrders.length,
      reviews: rows.reviews.length,
      notifications: rows.notifications.length,
    },
    sellerIds,
  };
}

// "10:30" in Lagos, for the rider's arrival window
function timeFmt(at: Date) {
  return new Intl.DateTimeFormat('en-NG', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Africa/Lagos',
  }).format(at);
}

// Takes out every demo account and what hangs off it, including any order a demo account took
// part in (a tester's order from a demo store goes too). The campus places and the delivery fee
// stay: they're the school's.
export async function removeDemo(prisma: PrismaClient) {
  const userIds = (
    await prisma.user.findMany({
      where: { email: { endsWith: `@${DEMO_DOMAIN}` } },
      select: { id: true },
    })
  ).map((u) => u.id);
  const listingIds = (
    await prisma.listing.findMany({
      where: { sellerId: { in: userIds } },
      select: { id: true },
    })
  ).map((l) => l.id);
  const orderIds = (
    await prisma.order.findMany({
      where: {
        OR: [
          { buyerId: { in: userIds } },
          { sellerOrders: { some: { sellerId: { in: userIds } } } },
        ],
      },
      select: { id: true },
    })
  ).map((o) => o.id);
  const sellerOrderIds = (
    await prisma.sellerOrder.findMany({
      where: { orderId: { in: orderIds } },
      select: { id: true },
    })
  ).map((so) => so.id);
  const paymentIds = (
    await prisma.payment.findMany({
      where: { orderId: { in: orderIds } },
      select: { id: true },
    })
  ).map((p) => p.id);
  const theirs = { in: userIds };

  await prisma.$transaction([
    prisma.review.deleteMany({
      where: {
        OR: [
          { sellerOrderId: { in: sellerOrderIds } },
          { listingId: { in: listingIds } },
          { reviewerId: theirs },
          { revieweeId: theirs },
        ],
      },
    }),
    prisma.payout.deleteMany({
      where: {
        OR: [{ sellerOrderId: { in: sellerOrderIds } }, { sellerId: theirs }],
      },
    }),
    prisma.refund.deleteMany({
      where: {
        OR: [
          { sellerOrderId: { in: sellerOrderIds } },
          { paymentId: { in: paymentIds } },
        ],
      },
    }),
    prisma.dispute.deleteMany({
      where: { sellerOrderId: { in: sellerOrderIds } },
    }),
    prisma.problemReport.deleteMany({ where: { orderId: { in: orderIds } } }),
    prisma.deliveryJob.deleteMany({ where: { orderId: { in: orderIds } } }),
    // A tester's order a demo rider took keeps its job, without the rider
    prisma.deliveryJob.updateMany({
      where: { riderId: theirs },
      data: { riderId: null },
    }),
    prisma.orderItem.deleteMany({
      where: { sellerOrderId: { in: sellerOrderIds } },
    }),
    prisma.sellerOrder.deleteMany({ where: { id: { in: sellerOrderIds } } }),
    prisma.payment.deleteMany({ where: { id: { in: paymentIds } } }),
    prisma.order.deleteMany({ where: { id: { in: orderIds } } }),
    prisma.cartItem.deleteMany({
      where: { OR: [{ userId: theirs }, { listingId: { in: listingIds } }] },
    }),
    prisma.wishlist.deleteMany({
      where: { OR: [{ userId: theirs }, { listingId: { in: listingIds } }] },
    }),
    prisma.supportReport.deleteMany({
      where: { OR: [{ userId: theirs }, { listingId: { in: listingIds } }] },
    }),
    prisma.moderationAction.deleteMany({
      where: {
        OR: [
          { listingId: { in: listingIds } },
          { targetUserId: theirs },
          { moderatorId: theirs },
        ],
      },
    }),
    prisma.verificationRequest.deleteMany({ where: { userId: theirs } }),
    prisma.listing.deleteMany({ where: { id: { in: listingIds } } }),
    prisma.notification.deleteMany({
      where: {
        OR: [{ userId: theirs }, { data: { path: ['demo'], equals: true } }],
      },
    }),
    prisma.auditLog.deleteMany({
      where: {
        OR: [{ actorId: theirs }, { meta: { path: ['demo'], equals: true } }],
      },
    }),
    prisma.user.deleteMany({ where: { id: { in: userIds } } }),
  ]);
  return {
    users: userIds.length,
    listings: listingIds.length,
    orders: orderIds.length,
  };
}

async function main() {
  const target = describeDatabaseUrl(process.env.DATABASE_URL);
  // The server and database, never the password, so it's clear which one this will change
  console.log(
    `${process.argv.includes('--remove') ? 'Removing the demo data from' : 'Adding the demo data to'} ` +
      `database "${target.database}" on ${target.host}`,
  );
  if (target.local) {
    console.log(
      "That's a database on this computer, not Neon. Stop now (Ctrl+C) if you meant staging.",
    );
  }
  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL!.trim(),
    }),
  });
  try {
    if (process.argv.includes('--remove')) {
      const removed = await removeDemo(prisma);
      console.log(
        `Removed the demo data: ${removed.users} accounts, ${removed.listings} listings and ${removed.orders} orders.`,
      );
      return;
    }
    const result = await seedDemo(prisma);
    console.log(
      `Demo data added to ${result.school}: ${result.counts.users} accounts, ${result.counts.listings} listings, ` +
        `${result.counts.orders} orders (${result.counts.sellerOrders} store orders), ${result.counts.reviews} reviews ` +
        `and ${result.counts.notifications} notifications.`,
    );
    if (result.placesAdded)
      console.log(`Added ${result.placesAdded} campus places.`);
    if (result.deliveryFeeSet) {
      console.log(
        `The school had no delivery fee; it's now ${formatNairaPlain(DEMO_DELIVERY_FEE_KOBO)}.`,
      );
    }
    console.log('\nEvery demo account signs in with DEMO_PASSWORD:');
    for (const s of result.sellers)
      console.log(`  seller  ${s.email}  (${s.store})`);
    for (const r of result.riders) console.log(`  rider   ${r}`);
    for (const b of result.buyers) console.log(`  buyer   ${b}`);
  } catch (error) {
    // Nothing is written until the first query gets through, so a refused connection changes nothing
    const message = error instanceof Error ? error.message : String(error);
    if (
      /can't reach database server|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|timeout/i.test(
        message,
      )
    ) {
      throw new Error(
        `Couldn't connect to ${target.host}. Nothing was changed. Check the address in Neon's ` +
          "Connect dialog, and that the project isn't paused (Neon pauses idle free projects; opening " +
          `its dashboard wakes it).\n\n${message}`,
      );
    }
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
