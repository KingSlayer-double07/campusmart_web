import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { SessionsService } from '../sessions/sessions.service';
import { inviteTokenHash } from './invite-token';
import { RidersService } from './riders.service';

const codeOf = (error: unknown) =>
  ((error as HttpException).getResponse() as { code?: string }).code;

describe('RidersService', () => {
  let service: RidersService;
  const prisma = {
    institution: { findUnique: jest.fn() },
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    invite: { updateMany: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(),
  };
  const audit = { record: jest.fn() };
  const mail = { send: jest.fn() };
  const sessions = { revokeAll: jest.fn() };
  const rider = (overrides: object = {}) => ({
    id: 'r1',
    email: 'musa@gmail.com',
    firstName: 'Musa',
    lastName: null,
    phone: null,
    isActive: true,
    password: null,
    createdAt: new Date(),
    institution: { id: 'i1', name: 'University of Lagos', isActive: true },
    _count: { deliveryJobs: 0 },
    ...overrides,
  });

  beforeEach(async () => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
      fn(prisma),
    );
    const moduleRef = await Test.createTestingModule({
      providers: [
        RidersService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: MailService, useValue: mail },
        { provide: SessionsService, useValue: sessions },
        {
          provide: ConfigService,
          useValue: { get: () => 'https://campusmart.test' },
        },
      ],
    }).compile();
    service = moduleRef.get(RidersService);
  });

  it('invites a rider at a campus: a DISPATCH account, a hashed token, an email with the link', async () => {
    prisma.institution.findUnique.mockResolvedValue({
      id: 'i1',
      name: 'University of Lagos',
      isActive: true,
    });
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: 'r1',
      email: 'musa@gmail.com',
      firstName: 'Musa',
    });
    prisma.user.findFirst.mockResolvedValue(rider());
    const dto = await service.invite(
      { email: 'musa@gmail.com', institutionId: 'i1', firstName: 'Musa' },
      'admin-1',
    );
    expect(dto).toMatchObject({ invitePending: true, activeJobs: 0 });
    expect(prisma.user.create.mock.calls[0][0].data).toMatchObject({
      role: 'DISPATCH',
      institutionId: 'i1',
    });
    const [to, template, vars] = mail.send.mock.calls[0];
    expect([to, template]).toEqual(['musa@gmail.com', 'rider-invite']);
    const token = new URL(vars.link).searchParams.get('token')!;
    expect(vars.link).toMatch(/^https:\/\/campusmart\.test\/dispatch\/invite/);
    expect(prisma.invite.create.mock.calls[0][0].data.tokenHash).toBe(
      inviteTokenHash(token),
    );
  });

  it('refuses an email that already has an account', async () => {
    prisma.institution.findUnique.mockResolvedValue({ id: 'i1', name: 'U' });
    prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
    const error = await service
      .invite(
        { email: 'ada@gmail.com', institutionId: 'i1', firstName: 'Ada' },
        'admin-1',
      )
      .catch((e: unknown) => e);
    expect(codeOf(error)).toBe('EMAIL_TAKEN');
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("won't switch off a rider holding a job (C5: reassign first), and ends sessions when it does", async () => {
    prisma.user.findFirst.mockResolvedValue(
      rider({ _count: { deliveryJobs: 2 } }),
    );
    const error = await service
      .setActive('r1', { isActive: false, reason: 'Left' }, 'admin-1')
      .catch((e: unknown) => e);
    expect(codeOf(error)).toBe('RIDER_HAS_JOBS');

    prisma.user.findFirst.mockResolvedValue(rider());
    await service.setActive('r1', { isActive: false, reason: 'Left' }, 'a1');
    expect(sessions.revokeAll).toHaveBeenCalledWith('r1', prisma);
    expect(audit.record.mock.calls[0][0]).toMatchObject({
      action: 'RIDER_DEACTIVATED',
      meta: { reason: 'Left' },
    });
  });

  it("doesn't resend an invite the rider already accepted", async () => {
    prisma.user.findFirst.mockResolvedValue(rider({ password: 'hash' }));
    const error = await service
      .resendInvite('r1', 'admin-1')
      .catch((e: unknown) => e);
    expect(codeOf(error)).toBe('INVITE_ALREADY_ACCEPTED');
  });
});
