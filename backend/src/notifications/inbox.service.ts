import { Injectable } from '@nestjs/common';
import { cursorArgs, toPage } from '../common/pagination';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  NotificationDto,
  NotificationPageDto,
  NotificationsQueryDto,
} from './dto/notification.dto';
import { NotificationPrefs, readPrefs } from './notification-prefs';

// Guide 10: the signed-in user's own notifications and email preferences
@Injectable()
export class InboxService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    userId: string,
    query: NotificationsQueryDto,
  ): Promise<NotificationPageDto> {
    const rows = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        data: true,
        readAt: true,
        createdAt: true,
      },
      ...cursorArgs(query),
    });
    const page = toPage(rows, query.limit);
    return {
      ...page,
      items: page.items.map(({ data, ...row }): NotificationDto => ({
        ...row,
        link: linkOf(data),
      })),
    };
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  // Only the user's own; no ids means everything
  async markRead(userId: string, ids?: string[]): Promise<number> {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, readAt: null, ...(ids && { id: { in: ids } }) },
      data: { readAt: new Date() },
    });
    return count;
  }

  async prefs(userId: string): Promise<NotificationPrefs> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { notificationPrefs: true },
    });
    return readPrefs(user.notificationPrefs);
  }

  async setPrefs(
    userId: string,
    prefs: NotificationPrefs,
  ): Promise<NotificationPrefs> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { notificationPrefs: { orderEmails: prefs.orderEmails } },
      select: { notificationPrefs: true },
    });
    return readPrefs(user.notificationPrefs);
  }
}

function linkOf(data: Prisma.JsonValue): string | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const link = data.link;
  // App paths only
  return typeof link === 'string' &&
    link.startsWith('/') &&
    !link.startsWith('//')
    ? link
    : null;
}
