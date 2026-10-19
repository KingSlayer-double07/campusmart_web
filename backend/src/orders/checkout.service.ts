import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthUser } from '../auth/auth-user';
import { lineListingSelect } from '../cart/cart.service';
import { lineState } from '../cart/cart-rules';
import type { Env } from '../config/env';
import { Prisma } from '../generated/prisma/client';
import { DeliveryMethod, OrderStatus } from '../generated/prisma/enums';
import { requireActiveInstitution } from '../institutions/institution-access';
import { sellerDisplayName } from '../listings/listing-rules';
import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { offersPickup } from '../sellers/seller-delivery';
import { assertOneDestination, chooseMethods } from './delivery-choice';
import { CheckoutDto, CheckoutResultDto } from './dto/order.dto';
import { collectionCode, sellerOrderCode, splitFee } from './order-codes';
import { reserveStock } from './order-stock';

type Buyer = { id: string; institutionId: string; email: string };

const checkoutLineSelect = {
  id: true,
  listingId: true,
  variantId: true,
  quantity: true,
  listing: { select: lineListingSelect },
} satisfies Prisma.CartItemSelect;

type CheckoutLine = Prisma.CartItemGetPayload<{
  select: typeof checkoutLineSelect;
}>;

// Checkout writes two unique values: the order's idempotency key (a clash means another request
// with this key won, handled first) and each seller order's code. So any other unique clash is a
// code that happens to exist already, retried with fresh codes.
const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002';
const CODE_ATTEMPTS = 3;

@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly settings: SettingsService,
    private readonly payments: PaymentsService,
  ) {}

  // Guide 4.2: the cart becomes one Order with one SellerOrder per seller, in one transaction
  async checkout(user: AuthUser, dto: CheckoutDto): Promise<CheckoutResultDto> {
    const buyer = {
      ...(await requireActiveInstitution(this.prisma, user)),
      email: user.email,
    };
    // OPay and PalmPay wait for Paystack to confirm them (decision P5)
    this.payments.assertMethodAvailable(dto.paymentMethod);

    // Step 1: the same key returns the same order, unchanged
    const replay = await this.existing(buyer, dto.idempotencyKey);
    if (replay) return replay;

    for (let attempt = 1; ; attempt += 1) {
      try {
        const order = await this.prisma.$transaction((tx) =>
          this.placeOrder(tx, buyer, dto),
        );
        return this.result(order, buyer.email);
      } catch (error) {
        // A request racing this one with the same key may have won; return its order
        const raced = await this.existing(buyer, dto.idempotencyKey);
        if (raced) return raced;
        if (isUniqueViolation(error) && attempt < CODE_ATTEMPTS) continue;
        throw error;
      }
    }
  }

  private async placeOrder(
    tx: Prisma.TransactionClient,
    buyer: Buyer,
    dto: CheckoutDto,
  ) {
    // Step 2: a cart that isn't empty, lines that pass 4.1, and a way for each store to arrive
    const lines = await tx.cartItem.findMany({
      where: { userId: buyer.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: checkoutLineSelect,
    });
    if (lines.length === 0) {
      throw new BadRequestException({
        code: 'CART_EMPTY',
        message: 'Your cart is empty',
      });
    }
    const priced = lines.map((line) => ({
      line,
      ...this.checkLine(line, buyer),
    }));
    const delivery = await this.resolveDelivery(tx, buyer, dto, lines);

    // Steps 3 and 4: reserve stock with conditional decrements, then recalculate the listings
    await reserveStock(
      tx,
      lines.map((l) => ({
        listingId: l.listingId,
        variantId: l.variantId,
        quantity: l.quantity,
      })),
    );

    // Step 5: one seller order per seller, with codes, fee and snapshotted items
    // Decision P1: admins can change the platform fee (R1a); new orders use the current value
    const feeBps = await this.settings.get('platformFeeBps');
    const bySeller = new Map<string, typeof priced>();
    for (const entry of priced) {
      const sellerId = entry.line.listing.sellerId;
      bySeller.set(sellerId, [...(bySeller.get(sellerId) ?? []), entry]);
    }
    // Stamped 1 ms apart in cart order: they'd otherwise share a millisecond, and the order pages
    // (sorted by createdAt) would show the stores in no fixed order
    const placedAt = Date.now();
    const sellerOrders = [...bySeller].map(([sellerId, entries], index) => {
      const subtotalKobo = entries.reduce(
        (sum, e) => sum + e.unitPriceKobo * e.line.quantity,
        0,
      );
      return {
        sellerId,
        createdAt: new Date(placedAt + index),
        deliveryMethod: delivery.methods.get(sellerId),
        code: sellerOrderCode(),
        collectionCode: collectionCode(),
        subtotalKobo,
        ...splitFee(subtotalKobo, feeBps),
        items: {
          create: entries.map(({ line, unitPriceKobo, variantLabel }) => ({
            listingId: line.listingId,
            variantId: line.variantId,
            titleSnapshot: line.listing.title,
            variantLabel,
            imageUrl: line.listing.images[0]?.url ?? null,
            unitPriceKobo,
            quantity: line.quantity,
          })),
        },
      };
    });
    const subtotalKobo = sellerOrders.reduce(
      (sum, so) => sum + so.subtotalKobo,
      0,
    );

    // Step 6: the order waits for payment until expiresAt
    const ttl = this.config.get('ORDER_PAYMENT_TTL_MINUTES', { infer: true });
    const order = await tx.order.create({
      data: {
        buyerId: buyer.id,
        institutionId: buyer.institutionId,
        campusPlaceId: delivery.campusPlaceId,
        deliveryAddress: delivery.deliveryAddress,
        buyerPhone: delivery.buyerPhone,
        deliveryFeeKobo: delivery.deliveryFeeKobo,
        status: OrderStatus.PENDING_PAYMENT,
        paymentMethod: dto.paymentMethod,
        subtotalKobo,
        totalKobo: subtotalKobo + delivery.deliveryFeeKobo,
        idempotencyKey: dto.idempotencyKey,
        expiresAt: new Date(Date.now() + ttl * 60_000),
        sellerOrders: { create: sellerOrders },
      },
      select: { id: true, totalKobo: true, status: true },
    });

    // Step 7: the cart is spent, and the rider's number is kept for next time (decision PH2)
    await tx.cartItem.deleteMany({ where: { userId: buyer.id } });
    if (delivery.buyerPhone) {
      await tx.user.update({
        where: { id: buyer.id },
        data: { phone: delivery.buyerPhone },
      });
    }
    return order;
  }

  // Each store's method (DM1), and for anything going by dispatch one destination (DF6), the
  // buyer's phone (C9) and one fee for the order (DF2): the campus fee, or nothing off campus,
  // where it's settled outside the app (DF4)
  private async resolveDelivery(
    tx: Prisma.TransactionClient,
    buyer: Buyer,
    dto: CheckoutDto,
    lines: CheckoutLine[],
  ) {
    const stores = new Map(
      lines.map(({ listing: { seller } }) => [
        seller.id,
        {
          sellerId: seller.id,
          storeName: sellerDisplayName(seller),
          offersPickup: offersPickup(seller.sellerProfile),
        },
      ]),
    );
    const methods = chooseMethods([...stores.values()], dto.stores);
    const none = {
      methods,
      campusPlaceId: null,
      deliveryAddress: null,
      buyerPhone: null,
      deliveryFeeKobo: 0,
    };
    if (![...methods.values()].includes(DeliveryMethod.DISPATCH)) return none;

    assertOneDestination(dto.destination);
    if (!dto.phone) {
      throw new BadRequestException({
        code: 'PHONE_REQUIRED',
        message: 'Add a phone number so the rider can call you',
      });
    }
    const { campusPlaceId, address } = dto.destination!;
    if (!campusPlaceId) {
      return {
        ...none,
        deliveryAddress: address!,
        buyerPhone: dto.phone,
      };
    }

    const [place, school] = await Promise.all([
      tx.campusPlace.findFirst({
        where: {
          id: campusPlaceId,
          institutionId: buyer.institutionId,
          isActive: true,
        },
        select: { id: true },
      }),
      tx.institution.findUnique({
        where: { id: buyer.institutionId },
        select: { deliveryFeeKobo: true },
      }),
    ]);
    if (!place) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Choose a place at your school',
      });
    }
    // Decision C10: on-campus dispatch only once an admin has set the fee
    if (school?.deliveryFeeKobo == null) {
      throw new ConflictException({
        code: 'DELIVERY_UNAVAILABLE',
        message:
          "Delivery on campus isn't available at your school yet. Choose pickup, or an address off campus.",
      });
    }
    return {
      ...none,
      campusPlaceId: place.id,
      buyerPhone: dto.phone,
      deliveryFeeKobo: school.deliveryFeeKobo,
    };
  }

  // The 4.1 checks again, now that money is involved. Prices come from the database only.
  private checkLine(line: CheckoutLine, buyer: Buyer) {
    const state = lineState(line.listing, line.variantId, buyer);
    const details = {
      itemId: line.id,
      listingId: line.listingId,
      variantId: line.variantId,
      title: line.listing.title,
    };
    if (
      state.problem === 'OUT_OF_STOCK' ||
      (!state.problem && line.quantity > state.stock)
    ) {
      throw new ConflictException({
        code: 'OUT_OF_STOCK',
        message: `${line.listing.title}: ${state.stock === 0 ? 'sold out' : `only ${state.stock} left`}`,
        details: { ...details, available: state.stock },
      });
    }
    if (state.problem) {
      throw new ConflictException({
        code: 'ITEM_UNAVAILABLE',
        message: `${line.listing.title} is no longer available`,
        details,
      });
    }
    return {
      unitPriceKobo: state.unitPriceKobo,
      variantLabel: state.variant?.label ?? null,
    };
  }

  private async existing(buyer: Buyer, idempotencyKey: string) {
    const order = await this.prisma.order.findUnique({
      where: { idempotencyKey },
      select: { id: true, buyerId: true, totalKobo: true, status: true },
    });
    if (!order) return null;
    if (order.buyerId !== buyer.id) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'Start checkout again',
      });
    }
    return this.result(order, buyer.email);
  }

  // Step 8: Paystack's payment page (guide 5.1). While PAYMENTS_ENABLED is false there is none, and
  // the unpaid order simply expires.
  private async result(
    order: { id: string; totalKobo: number; status: OrderStatus },
    email: string,
  ): Promise<CheckoutResultDto> {
    const page = await this.payments.pageFor(order, email);
    return {
      orderId: order.id,
      totalKobo: order.totalKobo,
      paymentsEnabled: this.payments.enabled,
      authorizationUrl: page?.authorizationUrl ?? null,
      reference: page?.reference ?? null,
    };
  }
}
