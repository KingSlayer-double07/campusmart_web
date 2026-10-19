import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../audit/audit.service';
import { cursorArgs, toPage } from '../common/pagination';
import type { Env } from '../config/env';
import type { Prisma } from '../generated/prisma/client';
import { DeliveryJobStatus, UserRole } from '../generated/prisma/enums';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { SessionsService } from '../sessions/sessions.service';
import { activeWhere } from '../admin/dto/active-toggle.dto';
import {
  AdminRiderDto,
  AdminRiderPageDto,
  InviteRiderDto,
  ListRidersQueryDto,
  SetRiderActiveDto,
} from './dto/rider.dto';
import { INVITE_DAYS, newInviteToken } from './invite-token';

const riderSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  isActive: true,
  password: true,
  createdAt: true,
  institution: { select: { id: true, name: true, isActive: true } },
  _count: {
    select: {
      deliveryJobs: { where: { status: DeliveryJobStatus.ASSIGNED } },
    },
  },
} satisfies Prisma.UserSelect;

type RiderRow = Prisma.UserGetPayload<{ select: typeof riderSelect }>;

const toDto = ({
  password,
  institution,
  _count,
  ...row
}: RiderRow): AdminRiderDto => ({
  ...row,
  invitePending: !password,
  institution: institution!,
  activeJobs: _count.deliveryJobs,
});

// Decisions DX1 and DX7: riders are invited by an admin, belong to one campus, and can't buy or
// sell. They set their own password from the invite link, which also confirms their email.
@Injectable()
export class RidersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly sessions: SessionsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async list(query: ListRidersQueryDto): Promise<AdminRiderPageDto> {
    const q = query.q?.trim();
    const rows = await this.prisma.user.findMany({
      where: {
        role: UserRole.DISPATCH,
        ...activeWhere(query.status),
        ...(query.institutionId && { institutionId: query.institutionId }),
        ...(q && {
          OR: [
            { email: { contains: q, mode: 'insensitive' } },
            { firstName: { contains: q, mode: 'insensitive' } },
            { lastName: { contains: q, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: riderSelect,
      ...cursorArgs(query),
    });
    const page = toPage(rows, query.limit);
    return { ...page, items: page.items.map(toDto) };
  }

  async invite(dto: InviteRiderDto, adminId: string): Promise<AdminRiderDto> {
    const institution = await this.prisma.institution.findUnique({
      where: { id: dto.institutionId },
      select: { id: true, name: true, isActive: true },
    });
    if (!institution) {
      throw new BadRequestException({
        code: 'INVALID_REFERENCE',
        message: "That institution doesn't exist",
        details: { field: 'institutionId' },
      });
    }
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException({
        code: 'EMAIL_TAKEN',
        message:
          'That email already has a CampusMart account. Riders need an email of their own.',
      });
    }
    const { rider, token } = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: dto.email,
          role: UserRole.DISPATCH,
          firstName: dto.firstName,
          lastName: dto.lastName ?? null,
          phone: dto.phone ?? null,
          institutionId: institution.id,
        },
        select: { id: true, email: true, firstName: true },
      });
      const token = await this.createInvite(created.id, adminId, tx);
      await this.audit.record(
        {
          actorId: adminId,
          action: 'RIDER_INVITED',
          entityType: 'User',
          entityId: created.id,
          meta: { email: dto.email, institutionId: institution.id },
        },
        tx,
      );
      return { rider: created, token };
    });
    await this.sendInvite(rider, institution.name, token);
    return this.get(rider.id);
  }

  // A new link for a rider who hasn't set their password yet; older links stop working
  async resendInvite(id: string, adminId: string): Promise<AdminRiderDto> {
    const rider = await this.find(id);
    if (rider.password) {
      throw new ConflictException({
        code: 'INVITE_ALREADY_ACCEPTED',
        message: 'This rider has already set their password',
      });
    }
    const token = await this.prisma.$transaction(async (tx) => {
      const created = await this.createInvite(rider.id, adminId, tx);
      await this.audit.record(
        {
          actorId: adminId,
          action: 'RIDER_INVITE_RESENT',
          entityType: 'User',
          entityId: rider.id,
        },
        tx,
      );
      return created;
    });
    await this.sendInvite(rider, rider.institution!.name, token);
    return this.get(rider.id);
  }

  // Switching a rider off ends their sessions. A rider holding a job is switched off only after
  // an admin reassigns it (C5), so no parcel is left with nobody.
  async setActive(
    id: string,
    dto: SetRiderActiveDto,
    adminId: string,
  ): Promise<AdminRiderDto> {
    const rider = await this.find(id);
    if (!dto.isActive && rider._count.deliveryJobs > 0) {
      throw new ConflictException({
        code: 'RIDER_HAS_JOBS',
        message: `This rider has ${rider._count.deliveryJobs} job(s) in progress. Reassign them first.`,
        details: { activeJobs: rider._count.deliveryJobs },
      });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: rider.id },
        data: { isActive: dto.isActive },
      });
      if (!dto.isActive) await this.sessions.revokeAll(rider.id, tx);
      await this.audit.record(
        {
          actorId: adminId,
          action: dto.isActive ? 'RIDER_REACTIVATED' : 'RIDER_DEACTIVATED',
          entityType: 'User',
          entityId: rider.id,
          meta: { reason: dto.reason },
        },
        tx,
      );
    });
    return this.get(rider.id);
  }

  private async get(id: string): Promise<AdminRiderDto> {
    return toDto(await this.find(id));
  }

  private async find(id: string) {
    const rider = await this.prisma.user.findFirst({
      where: { id, role: UserRole.DISPATCH },
      select: riderSelect,
    });
    if (!rider) throw new NotFoundException('Rider not found');
    return rider;
  }

  private async createInvite(
    userId: string,
    invitedById: string,
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    const now = new Date();
    // Only the newest link works
    await tx.invite.updateMany({
      where: { userId, usedAt: null, expiresAt: { gt: now } },
      data: { expiresAt: now },
    });
    const { token, tokenHash } = newInviteToken();
    await tx.invite.create({
      data: {
        userId,
        invitedById,
        tokenHash,
        expiresAt: new Date(now.getTime() + INVITE_DAYS * 86_400_000),
      },
    });
    return token;
  }

  // Printed to the console until MAIL_* is set up (S4)
  private async sendInvite(
    rider: { email: string; firstName: string | null },
    institution: string,
    token: string,
  ) {
    const appUrl = this.config.get('APP_URL', { infer: true });
    await this.mail.send(rider.email, 'rider-invite', {
      firstName: rider.firstName,
      institution,
      link: `${appUrl}/dispatch/invite?token=${token}`,
      days: INVITE_DAYS,
    });
  }
}
