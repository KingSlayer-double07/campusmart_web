import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { UserRole } from '../generated/prisma/enums';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';

export interface NotificationInput {
  type: string; // 'ORDER_PAID', 'NEW_ORDER', 'PAYOUT_FAILED', ...
  title: string;
  body: string;
  // An app path the notification opens, e.g. /orders/<id>
  link?: string;
  data?: Record<string, string | number | boolean | null>;
}

// D19: status changes become Notification rows the app polls; order and payment events also go by
// email (decision T7; console in development). The bell and preferences arrive in Phase 10.
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async notify(
    userIds: string | string[],
    input: NotificationInput,
    { email = true } = {},
  ): Promise<void> {
    const ids = [...new Set(Array.isArray(userIds) ? userIds : [userIds])];
    if (ids.length === 0) return;
    await this.prisma.notification.createMany({
      data: ids.map((userId) => ({
        userId,
        type: input.type,
        title: input.title,
        body: input.body,
        data: {
          ...input.data,
          ...(input.link && { link: input.link }),
        },
      })),
    });
    if (!email) return;
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { email: true },
    });
    const link = input.link
      ? `${this.config.get('APP_URL', { infer: true })}${input.link}`
      : null;
    // A failed email never undoes what happened; the notification row is already there
    await Promise.all(
      users.map(({ email: to }) =>
        this.mail
          .send(to, 'notification', {
            title: input.title,
            body: input.body,
            link,
          })
          .catch((error: unknown) =>
            this.logger.error(
              `Couldn't email ${input.type}: ${error instanceof Error ? error.message : String(error)}`,
            ),
          ),
      ),
    );
  }

  // Decision P10: every admin account, in the app and by email
  async alertAdmins(input: NotificationInput): Promise<void> {
    const admins = await this.prisma.user.findMany({
      where: { role: UserRole.ADMIN, isActive: true },
      select: { id: true },
    });
    this.logger.warn(`Admin alert ${input.type}: ${input.body}`);
    await this.notify(
      admins.map((a) => a.id),
      input,
    );
  }
}
