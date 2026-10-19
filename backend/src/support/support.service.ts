import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthUser } from '../auth/auth-user';
import type { Env } from '../config/env';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../uploads/cloudinary.service';
import { isOwnUploadUrl, uploadFolder } from '../uploads/cloudinary-urls';
import {
  CreateSupportReportDto,
  SupportContactsDto,
  SupportReceiptDto,
} from './dto/support.dto';

const TYPE_LABELS: Record<CreateSupportReportDto['type'], string> = {
  BUG: 'Something isn’t working',
  ORDER: 'An order',
  PAYMENT: 'A payment',
  OTHER: 'Something else',
};

// Guide 10 and decision T4: reports go to the admins' queue at /admin/reports; the contacts come from
// environment variables
@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly cloudinary: CloudinaryService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  contacts(): SupportContactsDto {
    return {
      email: this.config.get('SUPPORT_EMAIL', { infer: true }) ?? null,
      phone: this.config.get('SUPPORT_PHONE', { infer: true }) ?? null,
      whatsapp: this.config.get('SUPPORT_WHATSAPP', { infer: true }) ?? null,
    };
  }

  async report(
    user: AuthUser,
    dto: CreateSupportReportDto,
  ): Promise<SupportReceiptDto> {
    if (dto.screenshotUrl) this.checkScreenshot(user.id, dto.screenshotUrl);
    const report = await this.prisma.supportReport.create({
      data: {
        userId: user.id,
        type: dto.type,
        message: dto.message,
        screenshotUrl: dto.screenshotUrl ?? null,
      },
      select: { id: true },
    });
    await this.notifications.alertAdmins({
      type: 'SUPPORT_REPORT',
      title: `New report: ${TYPE_LABELS[dto.type]}`,
      body:
        dto.message.length > 140
          ? `${dto.message.slice(0, 137)}…`
          : dto.message,
      link: '/admin/reports',
    });
    return report;
  }

  // Only a screenshot in this user's own support folder (guide 3.1 rule 4)
  private checkScreenshot(userId: string, url: string) {
    const { cloudName } = this.cloudinary.requireSettings();
    if (!isOwnUploadUrl(url, cloudName, uploadFolder('SUPPORT', userId))) {
      throw new BadRequestException({
        code: 'INVALID_IMAGE',
        message:
          "The screenshot wasn't uploaded through CampusMart. Please add it again.",
      });
    }
  }
}
