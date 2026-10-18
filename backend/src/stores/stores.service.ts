import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user';
import { cursorArgs, CursorQueryDto, toPage } from '../common/pagination';
import type { Prisma } from '../generated/prisma/client';
import {
  ListingStatus,
  UserRole,
  VerificationStatus,
} from '../generated/prisma/enums';
import type { ListingPageDto } from '../listings/dto/listing.dto';
import { sellerDisplayName } from '../listings/listing-rules';
import { cardSelect, toCard } from '../listings/listing.select';
import { PrismaService } from '../prisma/prisma.service';
import type { ReviewPageDto } from '../reviews/dto/review.dto';
import { ReviewsService } from '../reviews/reviews.service';
import { isTrusted } from '../trust/trust-rules';
import {
  StoreCardDto,
  StoreDto,
  StorePageDto,
  StoresQueryDto,
} from './dto/store.dto';

const DAY_MS = 24 * 60 * 60 * 1000;
const FEATURED_LIMIT = 10;

const storeSelect = {
  id: true,
  username: true,
  firstName: true,
  createdAt: true,
  trustScore: true,
  verificationStatus: true,
  sellerProfile: {
    select: {
      storeName: true,
      logoUrl: true,
      bio: true,
      ratingAvg: true,
      ratingCount: true,
      isOnline: true,
      allowsPickup: true,
      pickupArea: true,
    },
  },
} satisfies Prisma.UserSelect;

type StoreRow = Prisma.UserGetPayload<{ select: typeof storeSelect }>;

const toCardDto = (row: StoreRow, listingCount: number): StoreCardDto => ({
  sellerId: row.id,
  storeName: sellerDisplayName(row),
  logoUrl: row.sellerProfile?.logoUrl ?? null,
  ratingAvg: row.sellerProfile?.ratingAvg ?? 0,
  ratingCount: row.sellerProfile?.ratingCount ?? 0,
  verified: row.verificationStatus === VerificationStatus.VERIFIED,
  trusted: isTrusted(row.trustScore),
  listingCount,
});

const liveListings = (sellerId: string, institutionId: string) =>
  ({
    sellerId,
    institutionId,
    isDeleted: false,
    status: ListingStatus.ACTIVE,
  }) satisfies Prisma.ListingWhereInput;

const notFound = () => new NotFoundException('Store not found');

// Guide 8.2: stores at the user's own school
@Injectable()
export class StoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reviews: ReviewsService,
  ) {}

  // Decision R3: rating × ln(1 + reviews), then paid orders in the last 30 days. Sellers with at
  // least one live listing only.
  async list(user: AuthUser, query: StoresQueryDto): Promise<StorePageDto> {
    if (!user.institutionId) return { items: [], nextCursor: null };
    const take = query.featured
      ? Math.min(query.limit, FEATURED_LIMIT)
      : query.limit;
    const offset = query.featured ? 0 : Number(query.cursor ?? 0);
    const since = new Date(Date.now() - 30 * DAY_MS).toISOString();
    const ranked = await this.prisma.$queryRaw<
      { id: string; listings: number }[]
    >`
      SELECT u."id", lc.n AS listings
      FROM "User" u
      JOIN "SellerProfile" sp ON sp."userId" = u."id"
      JOIN LATERAL (
        SELECT COUNT(*)::int AS n FROM "Listing" l
        WHERE l."sellerId" = u."id" AND l."institutionId" = ${user.institutionId}
          AND l."status" = 'ACTIVE' AND NOT l."isDeleted"
      ) lc ON lc.n > 0
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS n FROM "SellerOrder" so
        JOIN "Order" o ON o."id" = so."orderId"
        WHERE so."sellerId" = u."id" AND o."status" = 'PAID'
          AND o."paidAt" >= (${since}::timestamptz AT TIME ZONE 'UTC')
      ) po ON true
      WHERE u."role" = 'SELLER' AND u."isActive"
        AND u."institutionId" = ${user.institutionId}
      ORDER BY sp."ratingAvg" * ln(1 + sp."ratingCount") DESC, po.n DESC, u."id"
      OFFSET ${offset} LIMIT ${take + 1}`;
    const page = ranked.slice(0, take);
    const rows = await this.prisma.user.findMany({
      where: { id: { in: page.map((r) => r.id) } },
      select: storeSelect,
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return {
      items: page.flatMap((r) => {
        const row = byId.get(r.id);
        return row ? [toCardDto(row, r.listings)] : [];
      }),
      nextCursor:
        !query.featured && ranked.length > take ? String(offset + take) : null,
    };
  }

  async detail(user: AuthUser, sellerId: string): Promise<StoreDto> {
    const row = await this.visible(user, sellerId);
    const listingCount = await this.prisma.listing.count({
      where: liveListings(sellerId, user.institutionId!),
    });
    const profile = row.sellerProfile;
    return {
      ...toCardDto(row, listingCount),
      bio: profile?.bio ?? null,
      isOnline: profile?.isOnline ?? false,
      pickupArea: profile?.allowsPickup ? (profile.pickupArea ?? null) : null,
      joinedAt: row.createdAt,
    };
  }

  async listings(
    user: AuthUser,
    sellerId: string,
    query: CursorQueryDto,
  ): Promise<ListingPageDto> {
    await this.visible(user, sellerId);
    const rows = await this.prisma.listing.findMany({
      where: liveListings(sellerId, user.institutionId!),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: cardSelect,
      ...cursorArgs(query),
    });
    const page = toPage(rows, query.limit);
    return { ...page, items: page.items.map(toCard) };
  }

  async reviewsOf(
    user: AuthUser,
    sellerId: string,
    query: CursorQueryDto,
  ): Promise<ReviewPageDto> {
    await this.visible(user, sellerId);
    return this.reviews.forSeller(sellerId, query);
  }

  // A seller at the user's school; anyone else's store reads as not found
  private async visible(user: AuthUser, sellerId: string): Promise<StoreRow> {
    if (!user.institutionId) throw notFound();
    const row = await this.prisma.user.findFirst({
      where: {
        id: sellerId,
        role: UserRole.SELLER,
        isActive: true,
        institutionId: user.institutionId,
        sellerProfile: { isNot: null },
      },
      select: storeSelect,
    });
    if (!row) throw notFound();
    return row;
  }
}
