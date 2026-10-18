import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user';
import { AuditService } from '../audit/audit.service';
import { cursorArgs, toPage } from '../common/pagination';
import { Prisma } from '../generated/prisma/client';
import { ListingStatus } from '../generated/prisma/enums';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AdminReportDto,
  AdminReportPageDto,
  AdminReportsQueryDto,
  ReportListingDto,
  ReportReceiptDto,
  UpdateReportDto,
} from './dto/moderation.dto';
import { REPORTS_TO_FLAG } from './moderation-rules';

const REPORT_REASON_LABELS: Record<ReportListingDto['reason'], string> = {
  PROHIBITED_ITEM: 'Prohibited item',
  MISLEADING: 'Misleading',
  COUNTERFEIT: 'Counterfeit',
  SCAM: 'Looks like a scam',
  OFFENSIVE: 'Offensive',
  OTHER: 'Other',
};

const HIDDEN_BY_REPORT =
  'Reported as a prohibited item. It’s hidden until CampusMart reviews it.';

const reportSelect = {
  id: true,
  userId: true,
  type: true,
  reason: true,
  message: true,
  listingId: true,
  status: true,
  resolutionNote: true,
  createdAt: true,
} satisfies Prisma.SupportReportSelect;

type ReportRow = Prisma.SupportReportGetPayload<{
  select: typeof reportSelect;
}>;

@Injectable()
export class ListingReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // Guide 9.1 rule 3 with decisions M4 and M4b: any verified user can report a listing once.
  // Five different users' open reports send it to review; a prohibited-item report hides it now.
  async report(
    user: AuthUser,
    listingId: string,
    dto: ReportListingDto,
  ): Promise<ReportReceiptDto> {
    // Only what the user can see: their own school's live listings
    const listing = await this.prisma.listing.findFirst({
      where: {
        id: listingId,
        institutionId: user.institutionId ?? undefined,
        isDeleted: false,
        status: { in: [ListingStatus.ACTIVE, ListingStatus.SOLDOUT] },
      },
      select: { title: true, sellerId: true },
    });
    if (!listing || !user.institutionId) {
      throw new NotFoundException('Listing not found');
    }
    if (listing.sellerId === user.id) {
      throw new BadRequestException({
        code: 'OWN_LISTING',
        message: 'You can’t report your own listing',
      });
    }

    const prohibited = dto.reason === 'PROHIBITED_ITEM';
    const result = await this.prisma
      .$transaction(async (tx) => {
        const report = await tx.supportReport.create({
          data: {
            userId: user.id,
            type: 'LISTING',
            reason: dto.reason,
            message: dto.details ?? REPORT_REASON_LABELS[dto.reason],
            listingId,
          },
          select: { id: true },
        });
        const openReports = await tx.supportReport.count({
          where: { listingId, type: 'LISTING', status: 'OPEN' },
        });
        // Only the request that crosses the line changes the listing, so admins are told once
        let changed = false;
        if (prohibited) {
          const hidden = await tx.listing.updateMany({
            where: {
              id: listingId,
              status: { in: [ListingStatus.ACTIVE, ListingStatus.SOLDOUT] },
            },
            data: {
              isFlagged: true,
              status: ListingStatus.FLAGGED,
              moderationReason: HIDDEN_BY_REPORT,
            },
          });
          changed = hidden.count > 0;
        } else if (openReports >= REPORTS_TO_FLAG) {
          const flagged = await tx.listing.updateMany({
            where: { id: listingId, isFlagged: false },
            data: { isFlagged: true },
          });
          changed = flagged.count > 0;
        }
        if (changed && prohibited) {
          await this.audit.record(
            {
              actorId: user.id,
              action: 'LISTING_HIDDEN_BY_REPORT',
              entityType: 'Listing',
              entityId: listingId,
              meta: { reportId: report.id },
            },
            tx,
          );
        }
        return { id: report.id, changed, openReports };
      })
      .catch((error: unknown) => {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          throw new ConflictException({
            code: 'ALREADY_REPORTED',
            message: 'You’ve already reported this listing',
          });
        }
        throw error;
      });

    if (result.changed) {
      await this.notifications.alertAdmins({
        type: prohibited ? 'LISTING_HIDDEN' : 'LISTING_FLAGGED',
        title: prohibited
          ? 'A listing was reported as prohibited'
          : 'A listing was reported several times',
        body: prohibited
          ? `"${listing.title}" is hidden until an admin reviews it`
          : `"${listing.title}" has ${result.openReports} open reports`,
        link: '/admin/listings',
      });
      if (prohibited) {
        await this.notifications.notify(
          listing.sellerId,
          {
            type: 'LISTING_HIDDEN',
            title: 'Your listing is hidden for review',
            body: `"${listing.title}" was reported as a prohibited item. It’s hidden until CampusMart reviews it.`,
            link: '/sellers/products',
          },
          { email: false },
        );
      }
    }
    return { id: result.id, hidden: prohibited };
  }

  async list(query: AdminReportsQueryDto): Promise<AdminReportPageDto> {
    const rows = await this.prisma.supportReport.findMany({
      where: {
        status: query.status,
        ...(query.type && { type: query.type }),
      },
      // Open reports oldest first, like a queue; closed ones latest first
      orderBy:
        query.status === 'OPEN'
          ? [{ createdAt: 'asc' }, { id: 'asc' }]
          : [{ resolvedAt: 'desc' }, { id: 'desc' }],
      select: reportSelect,
      ...cursorArgs(query),
    });
    const page = toPage(rows, query.limit);
    return { ...page, items: await this.toDtos(page.items) };
  }

  async update(
    id: string,
    dto: UpdateReportDto,
    adminId: string,
  ): Promise<AdminReportDto> {
    const closing = dto.status === 'CLOSED';
    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.supportReport.updateMany({
        where: { id, status: closing ? 'OPEN' : 'CLOSED' },
        data: closing
          ? {
              status: 'CLOSED',
              resolvedAt: new Date(),
              resolvedById: adminId,
              resolutionNote: dto.note,
            }
          : {
              status: 'OPEN',
              resolvedAt: null,
              resolvedById: null,
              resolutionNote: null,
            },
      });
      if (changed.count === 0) {
        const exists = await tx.supportReport.count({ where: { id } });
        if (!exists) throw new NotFoundException('Report not found');
        throw new ConflictException({
          code: 'CONFLICT',
          message: closing
            ? 'This report is already closed'
            : 'This report is already open',
        });
      }
      await this.audit.record(
        {
          actorId: adminId,
          action: closing ? 'REPORT_CLOSED' : 'REPORT_REOPENED',
          entityType: 'SupportReport',
          entityId: id,
          meta: { note: dto.note ?? null },
        },
        tx,
      );
    });
    const row = await this.prisma.supportReport.findUniqueOrThrow({
      where: { id },
      select: reportSelect,
    });
    const [report] = await this.toDtos([row]);
    return report;
  }

  // SupportReport keeps plain ids, so the reporters and listings are looked up in two queries
  private async toDtos(rows: ReportRow[]): Promise<AdminReportDto[]> {
    const [users, listings] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: rows.map((r) => r.userId) } },
        select: { id: true, email: true },
      }),
      this.prisma.listing.findMany({
        where: {
          id: { in: rows.map((r) => r.listingId).filter((l) => l !== null) },
        },
        select: { id: true, title: true },
      }),
    ]);
    return rows.map(({ userId, ...row }) => ({
      ...row,
      listingTitle: listings.find((l) => l.id === row.listingId)?.title ?? null,
      reporterEmail: users.find((u) => u.id === userId)?.email ?? '',
    }));
  }
}
