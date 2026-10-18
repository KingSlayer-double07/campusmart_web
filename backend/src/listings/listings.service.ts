import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user';
import { openSellerOrdersWithListing } from '../common/open-seller-orders';
import { Prisma } from '../generated/prisma/client';
import { ListingStatus } from '../generated/prisma/enums';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { BannedWordsService } from '../settings/banned-words.service';
import { deliveryDetailsSelect } from '../sellers/seller-delivery';
import { assertCanPublish } from '../sellers/seller-verification';
import { CloudinaryService } from '../uploads/cloudinary.service';
import { isOwnUpload, uploadFolder } from '../uploads/cloudinary-urls';
import type {
  CreateListingDto,
  ListingImageInputDto,
  ListingVariantInputDto,
  ListingStatusDto,
  UpdateListingDto,
} from './dto/listing-input.dto';
import type {
  ListListingsQueryDto,
  SellerListingsQueryDto,
} from './dto/listing-query.dto';
import type {
  ListingCardDto,
  ListingDto,
  ListingPageDto,
} from './dto/listing.dto';
import {
  afterCursor,
  cursorAfter,
  decodeCursor,
  encodeCursor,
  escapeLike,
  orderByFor,
  POPULAR_CAP,
} from './listing-cursor';
import { duplicateLabel, nextStatus } from './listing-rules';
import { cardSelect, fullSelect, toCard, toListingDto } from './listing.select';
import { recalculateListingStock } from './listing-stock';

const RELATED_LIMIT = 10;

@Injectable()
export class ListingsService {
  private readonly logger = new Logger(ListingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
    private readonly bannedWords: BannedWordsService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Buyer reads (guide 3.1 rule 1: own institution, not deleted, ACTIVE) ──

  async browse(
    user: AuthUser,
    query: ListListingsQueryDto,
  ): Promise<ListingPageDto> {
    // An account with no institution (e.g. an admin) sees nothing, never everything
    if (!user.institutionId) return { items: [], nextCursor: null };
    if (query.sort === 'popular') {
      return this.browsePopular(user.institutionId, query);
    }

    const sort = query.sort;
    const cursor = decodeCursor(query.cursor, sort);
    const where = this.buyerWhere(user.institutionId, query);
    const rows = await this.prisma.listing.findMany({
      where:
        cursor && cursor.s !== 'popular'
          ? { AND: [where, afterCursor(cursor)] }
          : where,
      orderBy: orderByFor(sort),
      take: query.limit + 1,
      select: cardSelect,
    });
    const items = rows.slice(0, query.limit);
    return {
      items: items.map(toCard),
      nextCursor:
        rows.length > query.limit
          ? cursorAfter(sort, items[items.length - 1])
          : null,
    };
  }

  async findOne(user: AuthUser, id: string): Promise<ListingDto> {
    const row = await this.visible(user, id, fullSelect);
    const isOwner = row.sellerId === user.id;
    if (!isOwner) this.recordView(id, user.id);
    return toListingDto(row, isOwner);
  }

  async related(user: AuthUser, id: string): Promise<ListingCardDto[]> {
    const source = await this.visible(user, id, {
      category: true,
      institutionId: true,
    });
    const rows = await this.prisma.listing.findMany({
      where: {
        institutionId: source.institutionId,
        isDeleted: false,
        status: ListingStatus.ACTIVE,
        category: source.category,
        id: { not: id },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: RELATED_LIMIT,
      select: cardSelect,
    });
    return rows.map(toCard);
  }

  // ── Seller's own listings ──────────────────────────────────────────────────

  async sellerListings(
    user: AuthUser,
    query: SellerListingsQueryDto,
  ): Promise<ListingPageDto> {
    const cursor = decodeCursor(query.cursor, 'newest');
    const where: Prisma.ListingWhereInput = {
      sellerId: user.id,
      isDeleted: false,
      ...(query.status && { status: query.status }),
    };
    const rows = await this.prisma.listing.findMany({
      where:
        cursor && cursor.s === 'newest'
          ? { AND: [where, afterCursor(cursor)] }
          : where,
      orderBy: orderByFor('newest'),
      take: query.limit + 1,
      select: cardSelect,
    });
    const items = rows.slice(0, query.limit);
    return {
      items: items.map(toCard),
      nextCursor:
        rows.length > query.limit
          ? cursorAfter('newest', items[items.length - 1])
          : null,
    };
  }

  async create(user: AuthUser, dto: CreateListingDto): Promise<ListingDto> {
    if (!user.institutionId) {
      throw new ForbiddenException({
        code: 'NO_INSTITUTION',
        message: 'Your account is not linked to a school, so it cannot sell',
      });
    }
    const publishing = dto.status === ListingStatus.ACTIVE;
    if (publishing) {
      await this.publishGate(user);
      assertConfirmed(dto.confirmNotProhibited);
    }
    this.assertImages(user.id, dto.images);
    const variants = dto.variants ?? [];
    this.assertVariants(variants);
    if (variants.length === 0 && dto.stock === undefined) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Enter how many you have in stock',
      });
    }

    const stock = variants.length
      ? variants.reduce((sum, v) => sum + v.stock, 0)
      : dto.stock!;
    const now = new Date();
    const held = publishing
      ? await this.bannedWords.findIn(dto.title, dto.description)
      : [];
    const status = held.length
      ? ListingStatus.FLAGGED
      : nextStatus(dto.status, stock);
    const listing = await this.prisma.listing.create({
      data: {
        title: dto.title,
        description: dto.description,
        priceKobo: dto.priceKobo,
        stock,
        category: dto.category,
        condition: dto.condition,
        status,
        ...(dto.confirmNotProhibited && { prohibitedConfirmedAt: now }),
        ...(isLive(status) && { wentLiveAt: now }),
        ...(held.length && { heldAt: now, heldWords: held }),
        sellerId: user.id,
        // Copied from the seller; the client never sends it (guide 3.1 rule 1)
        institutionId: user.institutionId,
        images: { create: dto.images.map(imageRow) },
        variants: { create: variants.map(variantRow) },
      },
      select: fullSelect,
    });
    if (held.length) await this.alertHeld(listing.title, held);
    return toListingDto(listing, true);
  }

  async update(
    user: AuthUser,
    id: string,
    dto: UpdateListingDto,
  ): Promise<ListingDto> {
    const current = await this.owned(user, id, {
      status: true,
      title: true,
      description: true,
      images: { select: { url: true, publicId: true } },
      variants: { select: { id: true, label: true } },
    });
    // Decision M4c: a live listing edited to use a banned word goes back for review
    const held =
      isLive(current.status) && (dto.title || dto.description)
        ? await this.bannedWords.findIn(
            dto.title ?? current.title,
            dto.description ?? current.description,
          )
        : [];
    if (dto.images) this.assertImages(user.id, dto.images);
    if (dto.variants) this.assertVariants(dto.variants);

    const removedImages = dto.images
      ? current.images.filter(
          (old) => !dto.images!.some((img) => img.publicId === old.publicId),
        )
      : [];

    await this.prisma.$transaction(async (tx) => {
      await tx.listing.update({
        where: { id },
        data: {
          title: dto.title,
          description: dto.description,
          priceKobo: dto.priceKobo,
          category: dto.category,
          condition: dto.condition,
        },
      });

      if (dto.images) {
        await tx.listingImage.deleteMany({ where: { listingId: id } });
        await tx.listingImage.createMany({
          data: dto.images.map((img, i) => ({
            ...imageRow(img, i),
            listingId: id,
          })),
        });
      }

      // Options are matched by name, so carts keep pointing at an option that stays
      if (dto.variants) {
        const sent = dto.variants.map((v) => v.label);
        await tx.listingVariant.deleteMany({
          where: { listingId: id, label: { notIn: sent } },
        });
        for (const variant of dto.variants) {
          const existing = current.variants.find(
            (v) => v.label === variant.label,
          );
          if (existing) {
            await tx.listingVariant.update({
              where: { id: existing.id },
              data: { ...variantRow(variant), isActive: true },
            });
          } else {
            await tx.listingVariant.create({
              data: { ...variantRow(variant), listingId: id },
            });
          }
        }
      }

      const hasVariants = dto.variants
        ? dto.variants.length > 0
        : current.variants.length > 0;
      if (!hasVariants && dto.stock !== undefined) {
        await tx.listing.update({ where: { id }, data: { stock: dto.stock } });
      }
      await recalculateListingStock(tx, id);
      if (held.length) {
        await tx.listing.update({
          where: { id },
          data: {
            status: ListingStatus.FLAGGED,
            heldAt: new Date(),
            heldWords: held,
          },
        });
      }
    });

    if (removedImages.length) void this.deleteImages(removedImages);
    if (held.length) await this.alertHeld(dto.title ?? current.title, held);
    return this.ownerView(id);
  }

  async setStatus(
    user: AuthUser,
    id: string,
    { status, confirmNotProhibited }: ListingStatusDto,
  ): Promise<ListingDto> {
    const current = await this.owned(user, id, {
      status: true,
      stock: true,
      title: true,
      description: true,
      prohibitedConfirmedAt: true,
      wentLiveAt: true,
    });
    const publishing = status === ListingStatus.ACTIVE;
    if (publishing) {
      await this.publishGate(user);
      assertConfirmed(confirmNotProhibited || !!current.prohibitedConfirmedAt);
    }
    if (current.status === ListingStatus.FLAGGED) {
      throw new ConflictException({
        code: 'LISTING_UNDER_REVIEW',
        message:
          'This listing is under review by CampusMart, so its status cannot change yet',
      });
    }
    const now = new Date();
    const held = publishing
      ? await this.bannedWords.findIn(current.title, current.description)
      : [];
    const next = held.length
      ? ListingStatus.FLAGGED
      : publishing
        ? nextStatus(ListingStatus.ACTIVE, current.stock)
        : status;
    await this.prisma.listing.update({
      where: { id },
      data: {
        status: next,
        ...(confirmNotProhibited &&
          !current.prohibitedConfirmedAt && { prohibitedConfirmedAt: now }),
        ...(isLive(next) && !current.wentLiveAt && { wentLiveAt: now }),
        ...(held.length && { heldAt: now, heldWords: held }),
      },
    });
    if (held.length) await this.alertHeld(current.title, held);
    return this.ownerView(id);
  }

  // Decision M4c: a held listing waits in the admins' review queue
  private alertHeld(title: string, words: string[]) {
    return this.notifications.alertAdmins({
      type: 'LISTING_HELD',
      title: 'A listing is waiting for review',
      body: `"${title}" uses: ${words.join(', ')}`,
      link: '/admin/listings',
    });
  }

  async remove(user: AuthUser, id: string): Promise<void> {
    await this.owned(user, id, { id: true });
    const openOrders = await this.prisma.sellerOrder.count({
      where: openSellerOrdersWithListing(id),
    });
    if (openOrders > 0) {
      throw new ConflictException({
        code: 'LISTING_HAS_OPEN_ORDERS',
        message: `This listing is in ${openOrders} order${openOrders === 1 ? '' : 's'} that ${openOrders === 1 ? "isn't" : "aren't"} finished yet. Archive it instead, or delete it once ${openOrders === 1 ? "it's" : "they're"} settled.`,
        details: { openOrders },
      });
    }
    // Soft delete: order history keeps pointing at it
    await this.prisma.listing.update({
      where: { id },
      data: { isDeleted: true },
    });
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private buyerWhere(
    institutionId: string,
    query: ListListingsQueryDto,
  ): Prisma.ListingWhereInput {
    const q = query.q?.trim();
    return {
      institutionId,
      isDeleted: false,
      status: ListingStatus.ACTIVE,
      ...(query.category && { category: query.category }),
      ...(query.condition && { condition: query.condition }),
      ...((query.minPriceKobo !== undefined ||
        query.maxPriceKobo !== undefined) && {
        priceKobo: { gte: query.minPriceKobo, lte: query.maxPriceKobo },
      }),
      // Guide 3.1 rule 8: title or description, case-insensitive (ILIKE). Prisma passes % and _
      // through as wildcards, so they're escaped to mean themselves.
      ...(q && {
        OR: [
          { title: { contains: escapeLike(q), mode: 'insensitive' } },
          { description: { contains: escapeLike(q), mode: 'insensitive' } },
        ],
      }),
    };
  }

  // Most viewed over the last 7 days (Lagos days), then newest; offset paging up to 200
  private async browsePopular(
    institutionId: string,
    query: ListListingsQueryDto,
  ): Promise<ListingPageDto> {
    const cursor = decodeCursor(query.cursor, 'popular');
    const offset = cursor && cursor.s === 'popular' ? cursor.o : 0;
    const take = Math.min(query.limit, POPULAR_CAP - offset);
    if (take <= 0) return { items: [], nextCursor: null };

    const conditions: Prisma.Sql[] = [
      Prisma.sql`l."institutionId" = ${institutionId}`,
      Prisma.sql`l."isDeleted" = false`,
      Prisma.sql`l."status" = 'ACTIVE'`,
    ];
    if (query.category) {
      conditions.push(
        Prisma.sql`l."category" = CAST(${query.category} AS "ListingCategory")`,
      );
    }
    if (query.condition) {
      conditions.push(
        Prisma.sql`l."condition" = CAST(${query.condition} AS "ProductCondition")`,
      );
    }
    if (query.minPriceKobo !== undefined) {
      conditions.push(Prisma.sql`l."priceKobo" >= ${query.minPriceKobo}`);
    }
    if (query.maxPriceKobo !== undefined) {
      conditions.push(Prisma.sql`l."priceKobo" <= ${query.maxPriceKobo}`);
    }
    const q = query.q?.trim();
    if (q) {
      const pattern = `%${escapeLike(q)}%`;
      conditions.push(
        Prisma.sql`(l."title" ILIKE ${pattern} OR l."description" ILIKE ${pattern})`,
      );
    }

    const ranked = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT l."id"
      FROM "Listing" l
      LEFT JOIN (
        SELECT "listingId", SUM("views") AS views
        FROM "ListingDailyStat"
        WHERE "date" > (now() AT TIME ZONE 'Africa/Lagos')::date - 7
        GROUP BY "listingId"
      ) s ON s."listingId" = l."id"
      WHERE ${Prisma.join(conditions, ' AND ')}
      ORDER BY COALESCE(s.views, 0) DESC, l."createdAt" DESC, l."id" DESC
      OFFSET ${offset} LIMIT ${take + 1}`;

    const ids = ranked.slice(0, take).map((r) => r.id);
    const rows = await this.prisma.listing.findMany({
      where: { id: { in: ids } },
      select: cardSelect,
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const next = offset + take;
    return {
      items: ids.flatMap((id) => {
        const row = byId.get(id);
        return row ? [toCard(row)] : [];
      }),
      nextCursor:
        ranked.length > take && next < POPULAR_CAP
          ? encodeCursor({ s: 'popular', o: next })
          : null,
    };
  }

  // What GET /listings/:id may show: same institution and not deleted; buyers see ACTIVE only,
  // the owner sees every status. Anything else is a 404, so IDs can't be probed.
  private async visible<S extends Prisma.ListingSelect>(
    user: AuthUser,
    id: string,
    select: S,
  ) {
    if (!user.institutionId) throw listingNotFound();
    const row = await this.prisma.listing.findFirst({
      where: {
        id,
        institutionId: user.institutionId,
        isDeleted: false,
        OR: [{ status: ListingStatus.ACTIVE }, { sellerId: user.id }],
      },
      select,
    });
    if (!row) throw listingNotFound();
    return row;
  }

  // Guide 3.1 rule 2: owner routes match on the seller too, and miss with a 404
  // Going live needs a verified seller with their delivery details saved (seller-verification.ts)
  private async publishGate(user: AuthUser): Promise<void> {
    const delivery = await this.prisma.sellerProfile.findUnique({
      where: { userId: user.id },
      select: deliveryDetailsSelect,
    });
    assertCanPublish(user, delivery);
  }

  private async owned<S extends Prisma.ListingSelect>(
    user: AuthUser,
    id: string,
    select: S,
  ) {
    const row = await this.prisma.listing.findFirst({
      where: { id, sellerId: user.id, isDeleted: false },
      select,
    });
    if (!row) throw listingNotFound();
    return row;
  }

  private async ownerView(id: string): Promise<ListingDto> {
    const row = await this.prisma.listing.findUniqueOrThrow({
      where: { id },
      select: fullSelect,
    });
    return toListingDto(row, true);
  }

  // Guide 3.1 rule 4
  private assertImages(sellerId: string, images: ListingImageInputDto[]) {
    const { cloudName } = this.cloudinary.requireSettings();
    const folder = uploadFolder('LISTING', sellerId);
    const foreign = images.find((img) => !isOwnUpload(img, cloudName, folder));
    if (foreign) {
      throw new BadRequestException({
        code: 'INVALID_IMAGE',
        message:
          "One of the photos wasn't uploaded through CampusMart. Please upload it again.",
        details: { url: foreign.url },
      });
    }
    if (new Set(images.map((i) => i.publicId)).size !== images.length) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'The same photo is listed twice',
      });
    }
  }

  private assertVariants(variants: ListingVariantInputDto[]) {
    const duplicate = duplicateLabel(variants.map((v) => v.label));
    if (duplicate) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: `"${duplicate}" is listed twice. Give each option a different name.`,
      });
    }
  }

  // Guide 3.1 rule 6 with decision A2: a view counts once per viewer per listing per Lagos day,
  // into one row per listing per day. Not awaited, never fails the request.
  private recordView(listingId: string, viewerId: string) {
    this.prisma.$executeRaw`
      WITH seen AS (
        INSERT INTO "ListingView" ("listingId", "viewerId", "date")
        VALUES (${listingId}, ${viewerId}, (now() AT TIME ZONE 'Africa/Lagos')::date)
        ON CONFLICT DO NOTHING
        RETURNING "listingId", "date"
      )
      INSERT INTO "ListingDailyStat" ("listingId", "date", "views")
      SELECT "listingId", "date", 1 FROM seen
      ON CONFLICT ("listingId", "date")
      DO UPDATE SET "views" = "ListingDailyStat"."views" + 1`.catch(
      (error: unknown) =>
        this.logger.warn(
          `Could not record a view of ${listingId}: ${String(error)}`,
        ),
    );
  }

  // Replaced photos are removed from Cloudinary in the background (guide 3.1 rule 4), except
  // ones an order still shows as its snapshot image.
  private async deleteImages(images: { url: string; publicId: string }[]) {
    try {
      const inOrders = await this.prisma.orderItem.findMany({
        where: { imageUrl: { in: images.map((i) => i.url) } },
        select: { imageUrl: true },
      });
      const keep = new Set(inOrders.map((o) => o.imageUrl));
      await this.cloudinary.destroy(
        images.filter((i) => !keep.has(i.url)).map((i) => i.publicId),
      );
    } catch (error) {
      this.logger.warn(`Could not clean up replaced photos: ${String(error)}`);
    }
  }
}

// Buyers can see it: live, or sold out
const isLive = (status: ListingStatus) =>
  status === ListingStatus.ACTIVE || status === ListingStatus.SOLDOUT;

// Decision M4a: the seller confirms the item isn't on the prohibited list before publishing
function assertConfirmed(confirmed: boolean | undefined) {
  if (!confirmed) {
    throw new BadRequestException({
      code: 'CONFIRM_NOT_PROHIBITED',
      message:
        'Confirm the item isn’t on the prohibited list before publishing it',
    });
  }
}

const listingNotFound = () => new NotFoundException('Listing not found');

const imageRow = (img: ListingImageInputDto, position: number) => ({
  url: img.url,
  publicId: img.publicId,
  position,
});

const variantRow = (v: ListingVariantInputDto) => ({
  label: v.label,
  priceKobo: v.priceKobo ?? null,
  stock: v.stock,
});
