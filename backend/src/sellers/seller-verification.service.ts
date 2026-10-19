import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user';
import { VerificationStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../uploads/cloudinary.service';
import { parseImageUrl, uploadFolder } from '../uploads/cloudinary-urls';
import {
  MyVerificationDto,
  SubmitVerificationDto,
  VerificationRequestDto,
} from './dto/verification.dto';

const requestSelect = {
  id: true,
  status: true,
  reviewNote: true,
  createdAt: true,
  reviewedAt: true,
} as const;

// A seller can send a new request when they've never sent one or the last was rejected
const CAN_SUBMIT: VerificationStatus[] = [
  VerificationStatus.UNVERIFIED,
  VerificationStatus.REJECTED,
];

@Injectable()
export class SellerVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  async mine(userId: string): Promise<MyVerificationDto> {
    const [user, latestRequest] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { verificationStatus: true },
      }),
      this.latest(userId),
    ]);
    return { status: user.verificationStatus, latestRequest };
  }

  async submit(
    user: AuthUser,
    dto: SubmitVerificationDto,
  ): Promise<MyVerificationDto> {
    const { cloudName } = this.cloudinary.requireSettings();
    const document = parseImageUrl(dto.documentUrl, cloudName);
    const folder = `${uploadFolder('VERIFICATION', user.id)}/`;
    if (
      !document ||
      document.type !== 'authenticated' ||
      !document.publicId.startsWith(folder)
    ) {
      throw new BadRequestException({
        code: 'INVALID_DOCUMENT',
        message: 'Upload the photo of your student ID from this page',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      // The status flip is the lock: two quick submits can't both open a request
      const claimed = await tx.user.updateMany({
        where: { id: user.id, verificationStatus: { in: CAN_SUBMIT } },
        data: { verificationStatus: VerificationStatus.PENDING },
      });
      if (claimed.count === 0) {
        const { verificationStatus } = await tx.user.findUniqueOrThrow({
          where: { id: user.id },
          select: { verificationStatus: true },
        });
        throw verificationStatus === VerificationStatus.VERIFIED
          ? new ConflictException({
              code: 'ALREADY_VERIFIED',
              message: 'Your store is already verified',
            })
          : new ConflictException({
              code: 'VERIFICATION_PENDING',
              message:
                "We're already checking your student ID. You'll see the result here.",
            });
      }
      await tx.verificationRequest.create({
        data: { userId: user.id, documentUrl: dto.documentUrl },
      });
    });

    return this.mine(user.id);
  }

  private latest(userId: string): Promise<VerificationRequestDto | null> {
    return this.prisma.verificationRequest.findFirst({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: requestSelect,
    });
  }
}
