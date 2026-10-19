import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth-user';
import { cursorArgs, CursorQueryDto, toPage } from '../common/pagination';
import { resolveViewer } from '../common/viewer';
import { buyerDisplayName } from '../dispatch/dispatch-rules';
import { Prisma } from '../generated/prisma/client';
import { ListingStatus } from '../generated/prisma/enums';
import { sellerDisplayName } from '../listings/listing-rules';
import { PrismaService } from '../prisma/prisma.service';
import {
  AdminReviewDto,
  AdminReviewPageDto,
  AdminReviewsQueryDto,
  CreateReviewDto,
  ListingReviewsQueryDto,
  ReviewDto,
  ReviewPageDto,
} from './dto/review.dto';
import { recountRatings, REVIEWABLE } from './review-rules';

const reviewSelect = {
  id: true,
  rating: true,
  comment: true,
  createdAt: true,
  listingId: true,
  revieweeId: true,
  hiddenAt: true,
  hiddenReason: true,
  reviewer: { select: { username: true, firstName: true } },
  listing: { select: { title: true } },
  reviewee: {
    select: {
      username: true,
      firstName: true,
      sellerProfile: { select: { storeName: true } },
    },
  },
} satisfies Prisma.ReviewSelect;

type Row = Prisma.ReviewGetPayload<{ select: typeof reviewSelect }>;

const toDto = (r: Row): ReviewDto => ({
  id: r.id,
  rating: r.rating,
  comment: r.comment,
  reviewerDisplayName: buyerDisplayName(r.reviewer),
  listingTitle: r.listing.title,
  createdAt: r.createdAt,
});

const toAdminDto = (r: Row): AdminReviewDto => ({
  ...toDto(r),
  listingId: r.listingId,
  sellerId: r.revieweeId,
  storeName: sellerDisplayName(r.reviewee),
  hiddenAt: r.hiddenAt,
  hiddenReason: r.hiddenReason,
});

const newestFirst = [
  { createdAt: 'desc' },
  { id: 'desc' },
] satisfies Prisma.ReviewOrderByWithRelationInput[];

// Guide 8.4 with decision R4: buyers rate what they received, once per item per store order;
// no edits or seller replies; admins can hide an abusive review
@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(
    buyer: AuthUser,
    sellerOrderId: string,
    dto: CreateReviewDto,
  ): Promise<ReviewDto> {
    const so = await this.prisma.sellerOrder.findFirst({
      where: { id: sellerOrderId, order: { buyerId: buyer.id } },
      select: {
        id: true,
        sellerId: true,
        fulfillmentStatus: true,
        items: { select: { listingId: true } },
      },
    });
    // Someone else's order looks the same as no order
    if (!so) throw new NotFoundException('Order not found');
    if (!REVIEWABLE.includes(so.fulfillmentStatus)) {
      throw new ForbiddenException({
        code: 'REVIEW_NOT_OPEN',
        message: 'You can rate an item once you’ve received it',
      });
    }
    if (!so.items.some((i) => i.listingId === dto.listingId)) {
      throw new BadRequestException({
        code: 'NOT_IN_ORDER',
        message: 'That item isn’t in this order',
      });
    }
    try {
      const id = await this.prisma.$transaction(async (tx) => {
        const review = await tx.review.create({
          data: {
            rating: dto.rating,
            comment: dto.comment || null,
            reviewerId: buyer.id,
            revieweeId: so.sellerId,
            listingId: dto.listingId,
            sellerOrderId: so.id,
          },
          select: { id: true },
        });
        await recountRatings(tx, dto.listingId, so.sellerId);
        return review.id;
      });
      return toDto(
        await this.prisma.review.findUniqueOrThrow({
          where: { id },
          select: reviewSelect,
        }),
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'ALREADY_REVIEWED',
          message: 'You’ve already rated this item for this order',
        });
      }
      throw error;
    }
  }

  // Reviews of a listing the viewer can see: at their school (a guest's chosen one), not removed
  async forListing(
    user: AuthUser | undefined,
    listingId: string,
    query: ListingReviewsQueryDto,
  ): Promise<ReviewPageDto> {
    const viewer = await resolveViewer(this.prisma, user, query.institutionId);
    const listing = viewer.institutionId
      ? await this.prisma.listing.findFirst({
          where: {
            id: listingId,
            institutionId: viewer.institutionId,
            isDeleted: false,
            OR: [
              {
                status: { in: [ListingStatus.ACTIVE, ListingStatus.SOLDOUT] },
              },
              ...(viewer.id ? [{ sellerId: viewer.id }] : []),
            ],
          },
          select: { id: true },
        })
      : null;
    if (!listing) throw new NotFoundException('Listing not found');
    return this.page({ listingId, hiddenAt: null }, query);
  }

  // A store's reviews; the stores service checks the store is visible first
  forSeller(sellerId: string, query: CursorQueryDto): Promise<ReviewPageDto> {
    return this.page({ revieweeId: sellerId, hiddenAt: null }, query);
  }

  async adminList(query: AdminReviewsQueryDto): Promise<AdminReviewPageDto> {
    const rows = await this.prisma.review.findMany({
      where: {
        hiddenAt: query.view === 'HIDDEN' ? { not: null } : null,
      },
      orderBy: newestFirst,
      select: reviewSelect,
      ...cursorArgs(query),
    });
    const page = toPage(rows, query.limit);
    return { ...page, items: page.items.map(toAdminDto) };
  }

  hide(id: string, reason: string, adminId: string): Promise<AdminReviewDto> {
    return this.setHidden(id, adminId, { reason });
  }

  show(id: string, adminId: string): Promise<AdminReviewDto> {
    return this.setHidden(id, adminId, null);
  }

  private async setHidden(
    id: string,
    adminId: string,
    hide: { reason: string } | null,
  ): Promise<AdminReviewDto> {
    const review = await this.prisma.review.findUnique({
      where: { id },
      select: { id: true, listingId: true, revieweeId: true, hiddenAt: true },
    });
    if (!review) throw new NotFoundException('Review not found');
    if ((review.hiddenAt !== null) === (hide !== null)) {
      throw new ConflictException({
        code: hide ? 'ALREADY_HIDDEN' : 'NOT_HIDDEN',
        message: hide ? 'This review is already hidden' : 'This review shows',
      });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.review.update({
        where: { id },
        data: hide
          ? {
              hiddenAt: new Date(),
              hiddenById: adminId,
              hiddenReason: hide.reason,
            }
          : { hiddenAt: null, hiddenById: null, hiddenReason: null },
      });
      await recountRatings(tx, review.listingId, review.revieweeId);
      await this.audit.record(
        {
          actorId: adminId,
          action: hide ? 'REVIEW_HIDDEN' : 'REVIEW_SHOWN',
          entityType: 'Review',
          entityId: id,
          ...(hide && { meta: { reason: hide.reason } }),
        },
        tx,
      );
    });
    return toAdminDto(
      await this.prisma.review.findUniqueOrThrow({
        where: { id },
        select: reviewSelect,
      }),
    );
  }

  private async page(
    where: Prisma.ReviewWhereInput,
    query: CursorQueryDto,
  ): Promise<ReviewPageDto> {
    const rows = await this.prisma.review.findMany({
      where,
      orderBy: newestFirst,
      select: reviewSelect,
      ...cursorArgs(query),
    });
    const page = toPage(rows, query.limit);
    return { ...page, items: page.items.map(toDto) };
  }
}
