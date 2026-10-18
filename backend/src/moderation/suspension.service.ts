import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { Prisma } from '../generated/prisma/client';
import {
  ListingStatus,
  ModerationActionType,
  UserRole,
} from '../generated/prisma/enums';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { SessionsService } from '../sessions/sessions.service';

type Tx = Prisma.TransactionClient;

// Guide 9.1 rule 1: a suspended user is signed out everywhere and their live listings are archived.
// Their open seller orders stay for the admins to handle. They see the reason at sign-in (M6).
@Injectable()
export class SuspensionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sessions: SessionsService,
    private readonly notifications: NotificationsService,
  ) {}

  async suspend(userId: string, reason: string, adminId: string) {
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true },
      });
      if (!user) throw new NotFoundException('User not found');
      if (user.id === adminId) {
        throw cannotSuspend("You can't suspend your own account");
      }
      if (user.role === UserRole.ADMIN) {
        throw cannotSuspend('Remove their admin role before suspending them');
      }
      // Claimed in one statement, so two admins can't suspend the same user twice
      if (!(await this.apply(tx, userId, reason, adminId, false))) {
        throw new ConflictException({
          code: 'ALREADY_SUSPENDED',
          message: 'This account is already suspended',
        });
      }
    });
  }

  // Decisions M4d and M4e: confirming a prohibited item suspends its seller, in the same
  // transaction as the rejection. Returns false when there was nothing to do (already
  // suspended, or an admin's own listing).
  async suspendForProhibitedItem(
    tx: Tx,
    sellerId: string,
    listingTitle: string,
    adminId: string,
  ): Promise<boolean> {
    const seller = await tx.user.findUniqueOrThrow({
      where: { id: sellerId },
      select: { role: true, isSuspended: true },
    });
    if (seller.isSuspended || seller.role === UserRole.ADMIN) return false;
    return this.apply(
      tx,
      sellerId,
      `Listed a prohibited item: "${listingTitle}"`,
      adminId,
      true,
    );
  }

  async unsuspend(userId: string, adminId: string) {
    await this.prisma.$transaction(async (tx) => {
      const lifted = await tx.user.updateMany({
        where: { id: userId, isSuspended: true },
        data: {
          isSuspended: false,
          suspendedAt: null,
          suspendedReason: null,
          suspendedById: null,
        },
      });
      if (lifted.count === 0) {
        const exists = await tx.user.count({ where: { id: userId } });
        if (!exists) throw new NotFoundException('User not found');
        throw new ConflictException({
          code: 'NOT_SUSPENDED',
          message: 'This account isn’t suspended',
        });
      }
      await this.audit.record(
        {
          actorId: adminId,
          action: 'USER_UNSUSPENDED',
          entityType: 'User',
          entityId: userId,
        },
        tx,
      );
    });
    // Archived listings stay archived; the seller publishes again what they still sell
    await this.notifications.notify(
      userId,
      {
        type: 'ACCOUNT_UNSUSPENDED',
        title: 'Your account is active again',
        body: 'You can use CampusMart again. Listings archived during the suspension stay archived until you publish them.',
      },
      { email: false },
    );
  }

  private async apply(
    tx: Tx,
    userId: string,
    reason: string,
    adminId: string,
    automatic: boolean,
  ): Promise<boolean> {
    const claimed = await tx.user.updateMany({
      where: { id: userId, isSuspended: false },
      data: {
        isSuspended: true,
        suspendedAt: new Date(),
        suspendedReason: reason,
        suspendedById: adminId,
      },
    });
    if (claimed.count === 0) return false;
    await this.sessions.revokeAll(userId, tx);
    const archived = await tx.listing.updateMany({
      where: {
        sellerId: userId,
        isDeleted: false,
        status: { in: [ListingStatus.ACTIVE, ListingStatus.SOLDOUT] },
      },
      data: { status: ListingStatus.ARCHIVED },
    });
    await tx.moderationAction.create({
      data: {
        type: ModerationActionType.SUSPEND_USER,
        reason,
        targetUserId: userId,
        moderatorId: adminId,
      },
    });
    await this.audit.record(
      {
        actorId: adminId,
        action: 'USER_SUSPENDED',
        entityType: 'User',
        entityId: userId,
        meta: { reason, archivedListings: archived.count, automatic },
      },
      tx,
    );
    return true;
  }
}

const cannotSuspend = (message: string) =>
  new BadRequestException({ code: 'CANNOT_SUSPEND', message });
