import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { cursorArgs, toPage } from '../common/pagination';
import type { Prisma } from '../generated/prisma/client';
import { ListingStatus, UserRole } from '../generated/prisma/enums';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { SessionsService } from '../sessions/sessions.service';
import {
  AdminUserDto,
  AdminUserPageDto,
  AdminUsersQueryDto,
  SetRoleDto,
} from './dto/moderation.dto';
import { SuspensionService } from './suspension.service';

const userSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  verificationStatus: true,
  emailVerifiedAt: true,
  isActive: true,
  isSuspended: true,
  suspendedAt: true,
  suspendedReason: true,
  createdAt: true,
  institution: { select: { name: true } },
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;

const ROLE_LABELS: Record<UserRole, string> = {
  BUYER: 'buyer',
  SELLER: 'seller',
  ADMIN: 'admin',
  PICKUP_AGENT: 'pickup agent',
  DISPATCH: 'rider',
};

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sessions: SessionsService,
    private readonly notifications: NotificationsService,
    private readonly suspension: SuspensionService,
  ) {}

  async list(query: AdminUsersQueryDto): Promise<AdminUserPageDto> {
    const q = query.q;
    const rows = await this.prisma.user.findMany({
      where: {
        ...(query.role && { role: query.role }),
        ...(query.institutionId && { institutionId: query.institutionId }),
        ...(query.suspended && { isSuspended: true }),
        ...(q && {
          OR: [
            { email: { contains: q, mode: 'insensitive' } },
            { firstName: { contains: q, mode: 'insensitive' } },
            { lastName: { contains: q, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: userSelect,
      ...cursorArgs(query),
    });
    const page = toPage(rows, query.limit);
    return { ...page, items: page.items.map(toAdminUser) };
  }

  // Decision M1: other admins sign up, then an admin gives them ADMIN here. This is the only way
  // to grant ADMIN (guide 9.1 rule 6). The user is signed out so the new role starts cleanly.
  async setRole(
    userId: string,
    { role }: SetRoleDto,
    adminId: string,
  ): Promise<AdminUserDto> {
    if (userId === adminId) {
      throw new BadRequestException({
        code: 'CANNOT_CHANGE_ROLE',
        message: 'You can’t change your own role. Ask another admin.',
      });
    }
    const changed = await this.prisma.$transaction(async (tx) => {
      // Lock the admins in one order, so two admins removing each other can't leave none
      const admins = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "User" WHERE role = 'ADMIN' ORDER BY id FOR UPDATE`;
      if (!admins.some((a) => a.id === adminId)) {
        throw new ForbiddenException('You are no longer an admin');
      }
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { role: true, institutionId: true },
      });
      if (!user) throw new NotFoundException('User not found');
      if (user.role === role) return null;
      if (
        user.role === UserRole.DISPATCH ||
        user.role === UserRole.PICKUP_AGENT
      ) {
        throw new BadRequestException({
          code: 'CANNOT_CHANGE_ROLE',
          message: 'Riders are managed on the riders screen',
        });
      }
      if (role === UserRole.SELLER && !user.institutionId) {
        throw new BadRequestException({
          code: 'NO_INSTITUTION',
          message: 'A seller needs a school. This account isn’t linked to one.',
        });
      }

      await tx.user.update({ where: { id: userId }, data: { role } });
      if (role === UserRole.SELLER) {
        await tx.sellerProfile.upsert({
          where: { userId },
          create: { userId },
          update: {},
        });
      }
      // Someone who stops selling takes their listings down; open orders carry on
      const archived =
        user.role === UserRole.SELLER
          ? await tx.listing.updateMany({
              where: {
                sellerId: userId,
                isDeleted: false,
                status: { in: [ListingStatus.ACTIVE, ListingStatus.SOLDOUT] },
              },
              data: { status: ListingStatus.ARCHIVED },
            })
          : { count: 0 };
      await this.sessions.revokeAll(userId, tx);
      await this.audit.record(
        {
          actorId: adminId,
          action: 'ROLE_CHANGED',
          entityType: 'User',
          entityId: userId,
          meta: {
            from: user.role,
            to: role,
            archivedListings: archived.count,
          },
        },
        tx,
      );
      return { from: user.role };
    });

    if (changed) {
      await this.notifications.notify(
        userId,
        {
          type: 'ROLE_CHANGED',
          title: 'Your account type changed',
          body: `You’re now a ${ROLE_LABELS[role]} on CampusMart. Sign in again to carry on.`,
        },
        { email: false },
      );
    }
    return this.get(userId);
  }

  async suspend(
    userId: string,
    reason: string,
    adminId: string,
  ): Promise<AdminUserDto> {
    await this.suspension.suspend(userId, reason, adminId);
    return this.get(userId);
  }

  async unsuspend(userId: string, adminId: string): Promise<AdminUserDto> {
    await this.suspension.unsuspend(userId, adminId);
    return this.get(userId);
  }

  private async get(userId: string): Promise<AdminUserDto> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: userSelect,
    });
    if (!row) throw new NotFoundException('User not found');
    return toAdminUser(row);
  }
}

function toAdminUser(row: UserRow): AdminUserDto {
  const name = [row.firstName, row.lastName].filter(Boolean).join(' ');
  return {
    id: row.id,
    email: row.email,
    name: name || null,
    role: row.role,
    institutionName: row.institution?.name ?? null,
    verificationStatus: row.verificationStatus,
    emailVerified: !!row.emailVerifiedAt,
    isSuspended: row.isSuspended,
    suspendedReason: row.suspendedReason,
    suspendedAt: row.suspendedAt,
    isActive: row.isActive,
    createdAt: row.createdAt,
  };
}
