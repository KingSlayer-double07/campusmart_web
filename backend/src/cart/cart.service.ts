import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user';
import type { Prisma } from '../generated/prisma/client';
import { ListingStatus } from '../generated/prisma/enums';
import { requireActiveInstitution } from '../institutions/institution-access';
import { cardSelect, toCard } from '../listings/listing.select';
import { PrismaService } from '../prisma/prisma.service';
import {
  lineIssue,
  lineState,
  MAX_CART_LINES,
  maxQuantity,
  type CartIssue,
  type LineState,
} from './cart-rules';
import {
  CartDto,
  CartGroupDto,
  MergeCartDto,
  SetCartItemDto,
} from './dto/cart.dto';

type Buyer = { id: string; institutionId: string };

// Everything lineState needs, plus the card the cart shows
export const lineListingSelect = {
  ...cardSelect,
  isDeleted: true,
  institutionId: true,
  variants: {
    select: {
      id: true,
      label: true,
      priceKobo: true,
      stock: true,
      isActive: true,
    },
  },
} satisfies Prisma.ListingSelect;

const cartLineSelect = {
  id: true,
  listingId: true,
  variantId: true,
  quantity: true,
  unitPriceKobo: true,
  listing: { select: lineListingSelect },
} satisfies Prisma.CartItemSelect;

type CartLine = Prisma.CartItemGetPayload<{ select: typeof cartLineSelect }>;

const itemUnavailable = () =>
  new NotFoundException({
    code: 'NOT_FOUND',
    message: "This item isn't available",
  });

// Turns lineState's verdict into the error PUT /cart/items answers with (guide 4.1)
export function assertCanAdd(
  listing: { status: ListingStatus },
  state: LineState,
  quantity: number,
): void {
  if (
    listing.status !== ListingStatus.ACTIVE ||
    state.problem === 'UNAVAILABLE'
  )
    throw itemUnavailable();
  if (state.problem === 'VARIANT_REQUIRED') {
    throw new BadRequestException({
      code: 'VARIANT_REQUIRED',
      message: 'Choose an option first',
    });
  }
  if (state.problem === 'VARIANT_UNAVAILABLE') {
    throw new NotFoundException({
      code: 'NOT_FOUND',
      message: "That option isn't available",
    });
  }
  if (state.problem === 'OWN_LISTING') {
    throw new BadRequestException({
      code: 'OWN_LISTING',
      message: "You can't buy your own listing",
    });
  }
  if (quantity > state.stock) {
    throw new ConflictException({
      code: 'OUT_OF_STOCK',
      message:
        state.stock === 0 ? 'This is sold out' : `Only ${state.stock} left`,
      details: { available: state.stock },
    });
  }
}

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  async get(user: AuthUser): Promise<CartDto> {
    const buyer = await requireActiveInstitution(this.prisma, user);
    return this.load(buyer);
  }

  async setItem(user: AuthUser, dto: SetCartItemDto): Promise<CartDto> {
    const buyer = await requireActiveInstitution(this.prisma, user);
    const variantKey = dto.variantId ?? '';
    if (dto.quantity === 0) {
      await this.prisma.cartItem.deleteMany({
        where: { userId: buyer.id, listingId: dto.listingId, variantKey },
      });
      return this.load(buyer);
    }

    const listing = await this.prisma.listing.findUnique({
      where: { id: dto.listingId },
      select: lineListingSelect,
    });
    if (!listing) throw itemUnavailable();
    const state = lineState(listing, dto.variantId, buyer);
    assertCanAdd(listing, state, dto.quantity);

    const key = {
      userId_listingId_variantKey: {
        userId: buyer.id,
        listingId: dto.listingId,
        variantKey,
      },
    };
    const existing = await this.prisma.cartItem.findUnique({
      where: key,
      select: { id: true },
    });
    if (!existing) {
      const lines = await this.prisma.cartItem.count({
        where: { userId: buyer.id },
      });
      if (lines >= MAX_CART_LINES) throw cartFull();
    }
    // Setting a quantity also takes note of today's price, which clears a "price changed" warning
    await this.prisma.cartItem.upsert({
      where: key,
      create: {
        userId: buyer.id,
        listingId: dto.listingId,
        variantId: dto.variantId ?? null,
        variantKey,
        quantity: dto.quantity,
        unitPriceKobo: state.unitPriceKobo,
      },
      update: { quantity: dto.quantity, unitPriceKobo: state.unitPriceKobo },
    });
    return this.load(buyer);
  }

  async removeItem(user: AuthUser, id: string): Promise<void> {
    const removed = await this.prisma.cartItem.deleteMany({
      where: { id, userId: user.id },
    });
    if (removed.count === 0) throw new NotFoundException('Cart item not found');
  }

  // After sign-in, the guest cart joins the account's (guide 4.1): the larger quantity wins,
  // capped at what's in stock; lines that can't be bought are skipped, as are lines past 50.
  async merge(user: AuthUser, dto: MergeCartDto): Promise<CartDto> {
    const buyer = await requireActiveInstitution(this.prisma, user);
    const listings = new Map(
      (
        await this.prisma.listing.findMany({
          where: { id: { in: dto.items.map((i) => i.listingId) } },
          select: lineListingSelect,
        })
      ).map((l) => [l.id, l]),
    );
    const lines = await this.prisma.cartItem.findMany({
      where: { userId: buyer.id },
      select: { id: true, listingId: true, variantKey: true, quantity: true },
    });

    for (const item of dto.items) {
      const listing = listings.get(item.listingId);
      if (!listing || listing.status !== ListingStatus.ACTIVE) continue;
      const state = lineState(listing, item.variantId, buyer);
      if (state.problem) continue;
      const variantKey = item.variantId ?? '';
      const current = lines.find(
        (l) => l.listingId === item.listingId && l.variantKey === variantKey,
      );
      const quantity = Math.min(
        Math.max(current?.quantity ?? 0, item.quantity),
        maxQuantity(state),
      );
      if (quantity < 1) continue;

      if (current) {
        if (quantity === current.quantity) continue;
        await this.prisma.cartItem.update({
          where: { id: current.id },
          data: { quantity, unitPriceKobo: state.unitPriceKobo },
        });
        current.quantity = quantity;
      } else {
        if (lines.length >= MAX_CART_LINES) continue;
        const created = await this.prisma.cartItem.create({
          data: {
            userId: buyer.id,
            listingId: item.listingId,
            variantId: item.variantId ?? null,
            variantKey,
            quantity,
            unitPriceKobo: state.unitPriceKobo,
          },
          select: {
            id: true,
            listingId: true,
            variantKey: true,
            quantity: true,
          },
        });
        lines.push(created);
      }
    }
    return this.load(buyer);
  }

  private async load(buyer: Buyer): Promise<CartDto> {
    const lines = await this.prisma.cartItem.findMany({
      where: { userId: buyer.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: cartLineSelect,
    });
    return toCartDto(lines, buyer);
  }
}

const cartFull = () =>
  new ConflictException({
    code: 'CART_FULL',
    message: `Your cart can hold up to ${MAX_CART_LINES} different items`,
  });

// Groups lines by seller, in the order the buyer first added from each (guide 4.1)
export function toCartDto(lines: CartLine[], buyer: Buyer): CartDto {
  const groups = new Map<string, CartGroupDto>();
  const issues: CartIssue[] = [];
  let subtotalKobo = 0;
  let itemCount = 0;

  for (const line of lines) {
    const state = lineState(line.listing, line.variantId, buyer);
    const card = toCard(line.listing);
    const variant = line.variantId
      ? line.listing.variants.find((v) => v.id === line.variantId)
      : undefined;
    const available = state.problem === null;
    const lineTotal = available ? state.unitPriceKobo * line.quantity : 0;

    let group = groups.get(card.seller.id);
    if (!group) {
      group = {
        seller: { id: card.seller.id, storeName: card.seller.displayName },
        items: [],
        subtotalKobo: 0,
      };
      groups.set(card.seller.id, group);
    }
    group.items.push({
      id: line.id,
      listing: card,
      variant: variant
        ? {
            id: variant.id,
            label: variant.label,
            priceKobo: variant.priceKobo,
            stock: Math.max(0, variant.stock),
          }
        : null,
      quantity: line.quantity,
      unitPriceKobo: state.unitPriceKobo,
      available,
      maxQuantity: maxQuantity(state),
    });
    group.subtotalKobo += lineTotal;
    subtotalKobo += lineTotal;
    itemCount += line.quantity;

    const issue = lineIssue(line, state);
    if (issue) issues.push(issue);
  }

  return { groups: [...groups.values()], subtotalKobo, itemCount, issues };
}
