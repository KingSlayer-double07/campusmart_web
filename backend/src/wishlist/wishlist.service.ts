import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user';
import { cursorArgs, CursorQueryDto, toPage } from '../common/pagination';
import { ListingStatus } from '../generated/prisma/enums';
import { cardSelect, toCard } from '../listings/listing.select';
import { PrismaService } from '../prisma/prisma.service';
import {
  WishlistIdsDto,
  WishlistItemDto,
  WishlistPageDto,
} from './dto/wishlist.dto';

// Enough for anyone's favourites, and a bound on the hearts list
export const WISHLIST_LIMIT = 500;

const notFound = () => new NotFoundException('Listing not found');

// Guide 8.1: favourites in the account, for listings at the user's own school
@Injectable()
export class WishlistService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthUser, query: CursorQueryDto): Promise<WishlistPageDto> {
    const rows = await this.prisma.wishlist.findMany({
      where: { userId: user.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        createdAt: true,
        listing: { select: { ...cardSelect, isDeleted: true } },
      },
      ...cursorArgs(query),
    });
    const page = toPage(rows, query.limit);
    return {
      ...page,
      items: page.items.map((row): WishlistItemDto => ({
        ...toCard(row.listing),
        available:
          !row.listing.isDeleted && row.listing.status === ListingStatus.ACTIVE,
        savedAt: row.createdAt,
      })),
    };
  }

  async ids(user: AuthUser): Promise<WishlistIdsDto> {
    const rows = await this.prisma.wishlist.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      select: { listingId: true },
      take: WISHLIST_LIMIT,
    });
    return { listingIds: rows.map((r) => r.listingId) };
  }

  // Idempotent: saving twice keeps one row
  async add(user: AuthUser, listingId: string): Promise<void> {
    const visible = await this.visibleIds(user, [listingId]);
    if (visible.length === 0) throw notFound();
    const saved = await this.prisma.wishlist.count({
      where: { userId: user.id },
    });
    if (saved >= WISHLIST_LIMIT) {
      const already = await this.prisma.wishlist.count({
        where: { userId: user.id, listingId },
      });
      if (already) return;
      throw new ConflictException({
        code: 'WISHLIST_FULL',
        message: `You can keep up to ${WISHLIST_LIMIT} favourites. Remove some to add more.`,
      });
    }
    await this.prisma.wishlist.createMany({
      data: [{ userId: user.id, listingId }],
      skipDuplicates: true,
    });
  }

  async remove(user: AuthUser, listingId: string): Promise<void> {
    await this.prisma.wishlist.deleteMany({
      where: { userId: user.id, listingId },
    });
  }

  // Decision R5: favourites saved on the phone before sign-in join the account
  async merge(user: AuthUser, listingIds: string[]): Promise<WishlistIdsDto> {
    const visible = await this.visibleIds(user, [...new Set(listingIds)]);
    const saved = await this.prisma.wishlist.count({
      where: { userId: user.id },
    });
    const room = Math.max(0, WISHLIST_LIMIT - saved);
    if (visible.length && room) {
      await this.prisma.wishlist.createMany({
        data: visible.slice(0, room).map((listingId) => ({
          userId: user.id,
          listingId,
        })),
        skipDuplicates: true,
      });
    }
    return this.ids(user);
  }

  // Listings at the user's school that buyers can see, or that are their own
  private async visibleIds(user: AuthUser, ids: string[]): Promise<string[]> {
    if (!user.institutionId || ids.length === 0) return [];
    const rows = await this.prisma.listing.findMany({
      where: {
        id: { in: ids },
        institutionId: user.institutionId,
        isDeleted: false,
        OR: [
          { status: { in: [ListingStatus.ACTIVE, ListingStatus.SOLDOUT] } },
          { sellerId: user.id },
        ],
      },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }
}
