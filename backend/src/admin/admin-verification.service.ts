import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { cursorArgs, toPage } from '../common/pagination';
import type { Prisma } from '../generated/prisma/client';
import { VerificationStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../uploads/cloudinary.service';
import { parseImageUrl, uploadFolder } from '../uploads/cloudinary-urls';
import {
  AdminVerificationPageDto,
  AdminVerificationRequestDto,
  DecideVerificationDto,
  ListVerificationRequestsQueryDto,
} from './dto/verification-request.dto';

const requestSelect = {
  id: true,
  status: true,
  documentUrl: true,
  createdAt: true,
  reviewedAt: true,
  reviewNote: true,
  user: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      sellerProfile: { select: { storeName: true } },
      institution: { select: { name: true } },
    },
  },
} satisfies Prisma.VerificationRequestSelect;

type RequestRow = Prisma.VerificationRequestGetPayload<{
  select: typeof requestSelect;
}>;

@Injectable()
export class AdminVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  async list(
    query: ListVerificationRequestsQueryDto,
  ): Promise<AdminVerificationPageDto> {
    const pending = query.status === 'PENDING';
    const rows = await this.prisma.verificationRequest.findMany({
      where: { status: query.status },
      // The queue is first come, first served; decided requests show the latest first
      orderBy: pending
        ? [{ createdAt: 'asc' }, { id: 'asc' }]
        : [{ reviewedAt: 'desc' }, { id: 'desc' }],
      select: requestSelect,
      ...cursorArgs(query),
    });
    const page = toPage(rows, query.limit);
    return { ...page, items: page.items.map((row) => this.toDto(row)) };
  }

  async decide(
    id: string,
    dto: DecideVerificationDto,
    adminId: string,
  ): Promise<AdminVerificationRequestDto> {
    const decision =
      dto.decision === 'VERIFIED'
        ? VerificationStatus.VERIFIED
        : VerificationStatus.REJECTED;

    await this.prisma.$transaction(async (tx) => {
      const request = await tx.verificationRequest.findUnique({
        where: { id },
        select: { userId: true },
      });
      if (!request) throw new NotFoundException('Request not found');

      // Only a pending request can be decided, so two admins can't decide it twice
      const decided = await tx.verificationRequest.updateMany({
        where: { id, status: VerificationStatus.PENDING },
        data: {
          status: decision,
          reviewNote: dto.note ?? null,
          reviewedAt: new Date(),
          reviewedById: adminId,
        },
      });
      if (decided.count === 0) {
        throw new ConflictException({
          code: 'VERIFICATION_ALREADY_DECIDED',
          message: 'Someone already decided this request',
        });
      }
      await tx.user.update({
        where: { id: request.userId },
        data: { verificationStatus: decision },
      });
      await this.audit.record(
        {
          actorId: adminId,
          action:
            decision === VerificationStatus.VERIFIED
              ? 'SELLER_VERIFIED'
              : 'SELLER_VERIFICATION_REJECTED',
          entityType: 'VerificationRequest',
          entityId: id,
          meta: { userId: request.userId, note: dto.note ?? null },
        },
        tx,
      );
    });

    const row = await this.prisma.verificationRequest.findUniqueOrThrow({
      where: { id },
      select: requestSelect,
    });
    return this.toDto(row);
  }

  private toDto(row: RequestRow): AdminVerificationRequestDto {
    const { documentUrl, user, ...rest } = row;
    return {
      ...rest,
      documentViewUrl: this.viewUrl(documentUrl, user.id),
      seller: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        storeName: user.sellerProfile?.storeName ?? null,
        institutionName: user.institution?.name ?? null,
      },
    };
  }

  // Only a private upload in the seller's own folder gets a link; anything else stays hidden
  private viewUrl(documentUrl: string, userId: string): string | null {
    const cloudName = this.cloudinary.settings?.cloudName;
    const document = cloudName ? parseImageUrl(documentUrl, cloudName) : null;
    if (
      !document ||
      document.type !== 'authenticated' ||
      !document.publicId.startsWith(`${uploadFolder('VERIFICATION', userId)}/`)
    ) {
      return null;
    }
    return this.cloudinary.privateImageUrl(document.publicId, document.format);
  }
}
