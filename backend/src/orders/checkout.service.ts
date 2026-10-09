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
import { OrderStatus } from '../generated/prisma/enums';
import { requireActiveInstitution } from '../institutions/institution-access';
import { PrismaService } from '../prisma/prisma.service';
import { CheckoutDto, CheckoutResultDto } from './dto/order.dto';
import { collectionCode, sellerOrderCode, splitFee } from './order-codes';
import { reserveStock } from './order-stock';

type Buyer = { id: string; institutionId: string };

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
  ) {}

  // Guide 4.2: the cart becomes one Order with one SellerOrder per seller, in one transaction
  async checkout(user: AuthUser, dto: CheckoutDto): Promise<CheckoutResultDto> {
    const buyer = await requireActiveInstitution(this.prisma, user);

    // Step 1: the same key returns the same order, unchanged
    const replay = await this.existing(buyer, dto.idempotencyKey);
    if (replay) return replay;

    for (let attempt = 1; ; attempt += 1) {
      try {
        const order = await this.prisma.$transaction((tx) =>
          this.placeOrder(tx, buyer, dto),
        );
        return this.result(order);
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
    // Step 2: a station at the buyer's school, a cart that isn't empty, lines that pass 4.1
    const station = await tx.pickupStation.findFirst({
      where: {
        id: dto.pickupStationId,
        institutionId: buyer.institutionId,
        isActive: true,
      },
      select: { id: true },
    });
    if (!station) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Choose a pickup station at your school',
      });
    }
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
    const feeBps = this.config.get('PLATFORM_FEE_BPS', { infer: true });
    const bySeller = new Map<string, typeof priced>();
    for (const entry of priced) {
      const sellerId = entry.line.listing.sellerId;
      bySeller.set(sellerId, [...(bySeller.get(sellerId) ?? []), entry]);
    }
    const sellerOrders = [...bySeller].map(([sellerId, entries]) => {
      const subtotalKobo = entries.reduce(
        (sum, e) => sum + e.unitPriceKobo * e.line.quantity,
        0,
      );
      return {
        sellerId,
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
        pickupStationId: station.id,
        status: OrderStatus.PENDING_PAYMENT,
        paymentMethod: dto.paymentMethod,
        subtotalKobo,
        totalKobo: subtotalKobo,
        idempotencyKey: dto.idempotencyKey,
        expiresAt: new Date(Date.now() + ttl * 60_000),
        sellerOrders: { create: sellerOrders },
      },
      select: { id: true, totalKobo: true },
    });

    // Step 7: the cart is spent
    await tx.cartItem.deleteMany({ where: { userId: buyer.id } });
    return order;
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
      select: { id: true, buyerId: true, totalKobo: true },
    });
    if (!order) return null;
    if (order.buyerId !== buyer.id) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'Start checkout again',
      });
    }
    return this.result(order);
  }

  // Step 8: Phase 5 starts a Paystack payment here. Until then (PAYMENTS_ENABLED=false) there is
  // no payment page, and the unpaid order simply expires.
  private result(order: { id: string; totalKobo: number }): CheckoutResultDto {
    return {
      orderId: order.id,
      totalKobo: order.totalKobo,
      authorizationUrl: null,
      reference: null,
    };
  }
}
