import { randomUUID } from 'crypto';
import {
  DeliveryMethod,
  ListingCategory,
  ListingStatus,
  PaymentMethod,
  PaymentStatus,
  ProductCondition,
  UserRole,
  VerificationStatus,
} from '../src/generated/prisma/enums';
import { collectionCode, sellerOrderCode } from '../src/orders/order-codes';
import type { PrismaService } from '../src/prisma/prisma.service';
import { createUser, DELIVERY_DETAILS } from './utils';

// Rows for the cart and checkout suites, written straight through Prisma (Phase 3's API paths
// are covered by their own suites).

let schools = 0;
export async function createSchool(prisma: PrismaService, isActive = true) {
  schools += 1;
  return prisma.institution.create({
    data: {
      name: `School ${schools}`,
      domains: [`school${schools}.edu.ng`],
      isActive,
    },
  });
}

export async function createSeller(
  prisma: PrismaService,
  institutionId: string,
  storeName = 'Ada Wears',
  { allowsPickup = false } = {},
) {
  const seller = await createUser(prisma, {
    role: UserRole.SELLER,
    institutionId,
    verificationStatus: VerificationStatus.VERIFIED,
  });
  await prisma.sellerProfile.create({
    data: { userId: seller.id, storeName, ...DELIVERY_DETAILS, allowsPickup },
  });
  return seller;
}

export async function createCampusPlace(
  prisma: PrismaService,
  institutionId: string,
  name = 'Faculty of Science',
  isActive = true,
) {
  return prisma.campusPlace.create({ data: { institutionId, name, isActive } });
}

export async function createListing(
  prisma: PrismaService,
  seller: { id: string; institutionId: string | null },
  options: {
    title?: string;
    priceKobo?: number;
    stock?: number;
    status?: ListingStatus;
    variants?: { label: string; stock: number; priceKobo?: number }[];
  } = {},
) {
  const variants = options.variants ?? [];
  const stock = variants.length
    ? variants.reduce((sum, v) => sum + v.stock, 0)
    : (options.stock ?? 5);
  return prisma.listing.create({
    data: {
      title: options.title ?? 'Desk lamp',
      description: '',
      priceKobo: options.priceKobo ?? 450_000,
      stock,
      status: options.status ?? ListingStatus.ACTIVE,
      // Buyers could see it (decision M4f), as the moderation migration backfills
      wentLiveAt:
        (options.status ?? ListingStatus.ACTIVE) === ListingStatus.ACTIVE
          ? new Date()
          : null,
      category: ListingCategory.TECH,
      condition: ProductCondition.USED_GOOD,
      sellerId: seller.id,
      institutionId: seller.institutionId!,
      images: {
        create: [
          {
            url: `https://res.cloudinary.com/campusmart-test/image/upload/v1/campusmart/listings/${seller.id}/lamp.jpg`,
            publicId: `campusmart/listings/${seller.id}/lamp`,
            position: 0,
          },
        ],
      },
      variants: {
        create: variants.map((v) => ({
          label: v.label,
          stock: v.stock,
          priceKobo: v.priceKobo ?? null,
        })),
      },
    },
    include: { variants: true },
  });
}

export async function createStation(
  prisma: PrismaService,
  institutionId: string,
  isActive = true,
) {
  return prisma.pickupStation.create({
    data: {
      institutionId,
      name: 'Library Pickup Point',
      address: 'Main library, ground floor',
      contactName: 'Mr Bello',
      contactPhone: '+234 801 234 5678',
      openingHours: [{ day: 'MON', open: '09:00', close: '17:00' }],
      isActive,
    },
  });
}

// A placed order waiting for payment, with its Paystack payment pending: one seller order per
// store, by dispatch or pickup from the seller. Pay it with payStub() below.
export async function createUnpaidOrder(
  prisma: PrismaService,
  buyer: { id: string; institutionId: string | null },
  stores: {
    seller: { id: string; institutionId: string | null };
    method: DeliveryMethod;
    priceKobo?: number;
  }[],
  { campusPlaceId = null as string | null, deliveryFeeKobo = 50_000 } = {},
) {
  const lines: {
    store: (typeof stores)[number];
    listing: Awaited<ReturnType<typeof createListing>>;
  }[] = [];
  for (const store of stores) {
    const listing = await createListing(prisma, store.seller, {
      priceKobo: store.priceKobo ?? 450_000,
    });
    lines.push({ store, listing });
  }
  const anyDispatch = stores.some((s) => s.method === DeliveryMethod.DISPATCH);
  const subtotal = lines.reduce((n, l) => n + l.listing.priceKobo, 0);
  const fee = anyDispatch && campusPlaceId ? deliveryFeeKobo : 0;
  const order = await prisma.order.create({
    data: {
      buyerId: buyer.id,
      institutionId: buyer.institutionId!,
      campusPlaceId: anyDispatch ? campusPlaceId : null,
      deliveryAddress:
        anyDispatch && !campusPlaceId ? '14 Akoka Road, Yaba' : null,
      buyerPhone: anyDispatch ? '+234 801 234 5678' : null,
      deliveryFeeKobo: fee,
      paymentMethod: PaymentMethod.CARD,
      subtotalKobo: subtotal,
      totalKobo: subtotal + fee,
      idempotencyKey: randomUUID(),
      expiresAt: new Date(Date.now() + 30 * 60_000),
      sellerOrders: {
        create: lines.map(({ store, listing }, i) => ({
          sellerId: store.seller.id,
          deliveryMethod: store.method,
          code: sellerOrderCode(),
          collectionCode: collectionCode(),
          subtotalKobo: listing.priceKobo,
          sellerPayoutKobo: listing.priceKobo,
          createdAt: new Date(Date.now() + i),
          items: {
            create: {
              listingId: listing.id,
              titleSnapshot: listing.title,
              unitPriceKobo: listing.priceKobo,
              quantity: 1,
            },
          },
        })),
      },
    },
  });
  const reference = `CM_${order.id}_1`;
  await prisma.payment.create({
    data: {
      orderId: order.id,
      reference,
      amountKobo: order.totalKobo,
      status: PaymentStatus.PENDING,
    },
  });
  return { ...order, reference };
}

// What Paystack sends for a successful charge (guide 5.2), for PaymentsService.handleEvent
export const chargeSuccess = (reference: string, amount: number) => ({
  event: 'charge.success',
  data: {
    reference,
    status: 'success',
    amount,
    currency: 'NGN',
    channel: 'card',
    fees: 0,
    paid_at: new Date().toISOString(),
  },
});
