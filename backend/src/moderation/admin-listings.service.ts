import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { cursorArgs, toPage } from '../common/pagination';
import type { Prisma } from '../generated/prisma/client';
import { ListingStatus, ModerationActionType } from '../generated/prisma/enums';
import { nextStatus, sellerDisplayName } from '../listings/listing-rules';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AdminListingDto,
  AdminListingPageDto,
  AdminListingsQueryDto,
  ModerateListingDto,
} from './dto/moderation.dto';
import { REJECT_REASON_LABELS } from './moderation-rules';
import { SuspensionService } from './suspension.service';

const listingSelect = {
  id: true,
  title: true,
  description: true,
  priceKobo: true,
  stock: true,
  status: true,
  isFlagged: true,
  heldAt: true,
  heldWords: true,
  wentLiveAt: true,
  moderationReason: true,
  sellerId: true,
  createdAt: true,
  images: {
    orderBy: { position: 'asc' },
    take: 1,
    select: { url: true },
  },
  seller: {
    select: {
      username: true,
      firstName: true,
      isSuspended: true,
      sellerProfile: { select: { storeName: true } },
    },
  },
} satisfies Prisma.ListingSelect;

type ListingRow = Prisma.ListingGetPayload<{ select: typeof listingSelect }>;

// Held by a banned word (M4c), or flagged by reports or an admin (M4, M4b)
export const inReview: Prisma.ListingWhereInput = {
  OR: [{ isFlagged: true }, { heldAt: { not: null } }],
};

const SELLER_LINK = '/sellers/products';

// What an admin's decision says on the reports it closes
const CLOSED_AS: Record<ModerateListingDto['type'], string> = {
  APPROVE: 'Approved',
  REJECT: 'Rejected',
  FLAG: 'Flagged',
  UNFLAG: 'Unflagged',
};

@Injectable()
export class AdminListingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly suspension: SuspensionService,
  ) {}

  async list(query: AdminListingsQueryDto): Promise<AdminListingPageDto> {
    const where: Prisma.ListingWhereInput = {
      isDeleted: false,
      ...(query.q && { title: { contains: query.q, mode: 'insensitive' } }),
      ...(query.view === 'REVIEW' && inReview),
      ...(query.view === 'HIDDEN' && {
        status: ListingStatus.FLAGGED,
        isFlagged: false,
        heldAt: null,
      }),
    };
    const rows = await this.prisma.listing.findMany({
      where,
      // The review queue is first come, first served; the other views show the newest first
      orderBy:
        query.view === 'REVIEW'
          ? [{ createdAt: 'asc' }, { id: 'asc' }]
          : [{ createdAt: 'desc' }, { id: 'desc' }],
      select: listingSelect,
      ...cursorArgs(query),
    });
    const page = toPage(rows, query.limit);
    return { ...page, items: await this.toDtos(page.items) };
  }

  async moderate(
    id: string,
    dto: ModerateListingDto,
    adminId: string,
  ): Promise<AdminListingDto> {
    if (dto.type === 'REJECT' && !dto.reason) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Choose why you’re rejecting it',
      });
    }

    const outcome = await this.prisma.$transaction(async (tx) => {
      const listing = await tx.listing.findFirst({
        where: { id, isDeleted: false },
        select: {
          title: true,
          stock: true,
          status: true,
          sellerId: true,
          wentLiveAt: true,
          isFlagged: true,
          heldAt: true,
          seller: { select: { isSuspended: true } },
        },
      });
      if (!listing) throw new NotFoundException('Listing not found');
      const now = new Date();
      const hidden = listing.status === ListingStatus.FLAGGED;
      const label = dto.reason ? REJECT_REASON_LABELS[dto.reason] : null;
      const reasonText = [label, dto.note].filter(Boolean).join(': ') || null;
      let data: Prisma.ListingUpdateInput;
      let closesReports = true;
      let suspended = false;

      switch (dto.type) {
        case 'APPROVE': {
          if (hidden && listing.seller.isSuspended) {
            throw new ConflictException({
              code: 'SELLER_SUSPENDED',
              message:
                'The seller is suspended. Lift the suspension before approving their listing.',
            });
          }
          const status = hidden
            ? nextStatus(ListingStatus.ACTIVE, listing.stock)
            : listing.status;
          data = {
            status,
            isFlagged: false,
            heldAt: null,
            heldWords: [],
            moderationReason: null,
            ...(hidden && !listing.wentLiveAt && { wentLiveAt: now }),
          };
          break;
        }
        case 'REJECT':
          data = {
            status: ListingStatus.FLAGGED,
            isFlagged: false,
            heldAt: null,
            heldWords: [],
            moderationReason: reasonText,
          };
          break;
        case 'FLAG':
          if (listing.isFlagged) throw notApplicable('It’s already flagged');
          data = { isFlagged: true };
          closesReports = false;
          break;
        case 'UNFLAG':
          if (!listing.isFlagged) throw notApplicable('It isn’t flagged');
          if (hidden) {
            throw notApplicable(
              'This listing is hidden. Approve or reject it instead.',
            );
          }
          data = { isFlagged: false };
          break;
      }

      const updated = await tx.listing.update({
        where: { id },
        data,
        select: { status: true },
      });
      if (closesReports) {
        await tx.supportReport.updateMany({
          where: { listingId: id, type: 'LISTING', status: 'OPEN' },
          data: {
            status: 'CLOSED',
            resolvedAt: now,
            resolvedById: adminId,
            resolutionNote: [CLOSED_AS[dto.type], reasonText]
              .filter(Boolean)
              .join(': '),
          },
        });
      }
      await tx.moderationAction.create({
        data: {
          type: ModerationActionType[dto.type],
          reason: reasonText,
          listingId: id,
          moderatorId: adminId,
        },
      });
      await this.audit.record(
        {
          actorId: adminId,
          action: 'LISTING_MODERATED',
          entityType: 'Listing',
          entityId: id,
          meta: {
            type: dto.type,
            reason: dto.reason ?? null,
            note: dto.note ?? null,
            from: listing.status,
            to: updated.status,
          },
        },
        tx,
      );
      // Decisions M4d-M4f: a prohibited item that buyers could see suspends its seller.
      // One the banned-word check held before it ever went live doesn't.
      if (
        dto.type === 'REJECT' &&
        dto.reason === 'PROHIBITED_ITEM' &&
        listing.wentLiveAt
      ) {
        suspended = await this.suspension.suspendForProhibitedItem(
          tx,
          listing.sellerId,
          listing.title,
          adminId,
        );
      }
      return { listing, wasHidden: hidden, reasonText, suspended };
    });

    await this.tellSeller(dto.type, outcome);
    return this.get(id);
  }

  private async tellSeller(
    type: ModerateListingDto['type'],
    {
      listing,
      wasHidden,
      reasonText,
      suspended,
    }: {
      listing: { title: string; sellerId: string };
      wasHidden: boolean;
      reasonText: string | null;
      suspended: boolean;
    },
  ) {
    // A suspended seller sees the reason when they try to sign in (M6)
    if (suspended) return;
    const notice =
      type === 'REJECT'
        ? {
            type: 'LISTING_REJECTED',
            title: 'Your listing was taken down',
            body: `"${listing.title}" was taken down: ${reasonText}. Edit it to send it for review again.`,
          }
        : type === 'APPROVE' && wasHidden
          ? {
              type: 'LISTING_APPROVED',
              title: 'Your listing is live',
              body: `"${listing.title}" was approved and buyers can see it now.`,
            }
          : null;
    if (!notice) return;
    await this.notifications.notify(
      listing.sellerId,
      { ...notice, link: SELLER_LINK },
      { email: false },
    );
  }

  private async get(id: string): Promise<AdminListingDto> {
    const row = await this.prisma.listing.findUniqueOrThrow({
      where: { id },
      select: listingSelect,
    });
    const [dto] = await this.toDtos([row]);
    return dto;
  }

  private async toDtos(rows: ListingRow[]): Promise<AdminListingDto[]> {
    const reports = rows.length
      ? await this.prisma.supportReport.findMany({
          where: {
            listingId: { in: rows.map((r) => r.id) },
            type: 'LISTING',
            status: 'OPEN',
          },
          select: { listingId: true, reason: true },
        })
      : [];
    return rows.map((row) => {
      const open = reports.filter((r) => r.listingId === row.id);
      const seller = row.seller;
      return {
        id: row.id,
        title: row.title,
        description: row.description,
        imageUrl: row.images[0]?.url ?? null,
        priceKobo: row.priceKobo,
        status: row.status,
        isFlagged: row.isFlagged,
        heldAt: row.heldAt,
        heldWords: row.heldWords,
        wentLive: !!row.wentLiveAt,
        moderationReason: row.moderationReason,
        openReports: open.length,
        reportReasons: [
          ...new Set(open.map((r) => r.reason).filter((r) => r !== null)),
        ],
        sellerId: row.sellerId,
        storeName: sellerDisplayName(seller),
        sellerSuspended: seller.isSuspended,
        createdAt: row.createdAt,
      };
    });
  }
}

const notApplicable = (message: string) =>
  new ConflictException({ code: 'MODERATION_NOT_APPLICABLE', message });
