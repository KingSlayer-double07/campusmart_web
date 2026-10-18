import { HttpException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'bcrypt';
import type { AuthUser } from '../auth/auth-user';
import { EmailCodesService } from '../auth/email-codes.service';
import { AuditService } from '../audit/audit.service';
import { EmailCodePurpose, UserRole } from '../generated/prisma/enums';
import { InstitutionsService } from '../institutions/institutions.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { SessionsService } from '../sessions/sessions.service';
import { CloudinaryService } from '../uploads/cloudinary.service';
import { AccountService } from './account.service';

const failure = (error: unknown) => ({
  status: (error as HttpException).getStatus(),
  code: ((error as HttpException).getResponse() as { code?: string }).code,
});

const buyer = (overrides: Partial<AuthUser> = {}) =>
  ({
    id: 'u1',
    email: 'ada@gmail.com',
    role: UserRole.BUYER,
    institutionId: null,
    schoolEmail: null,
    schoolEmailVerifiedAt: null,
    emailVerifiedAt: new Date(),
    ...overrides,
  }) as AuthUser;

describe('AccountService', () => {
  let service: AccountService;
  const prisma = {
    institution: { findUnique: jest.fn() },
    user: {
      update: jest.fn(),
      count: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    cartItem: { deleteMany: jest.fn() },
    sellerProfile: { upsert: jest.fn(), updateMany: jest.fn() },
    sellerOrder: { count: jest.fn() },
    payout: { count: jest.fn() },
    verificationRequest: { findMany: jest.fn(), deleteMany: jest.fn() },
    wishlist: { deleteMany: jest.fn() },
    notification: { deleteMany: jest.fn() },
    emailCode: { deleteMany: jest.fn() },
    listing: { updateMany: jest.fn() },
    order: { updateMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const audit = { record: jest.fn() };
  const emailCodes = {
    assertCanSend: jest.fn(),
    issue: jest.fn(),
    consume: jest.fn(),
  };
  const mail = { send: jest.fn() };
  const institutions = { findForEmail: jest.fn() };
  const sessions = { revokeAll: jest.fn() };
  const cloudinary = {
    settings: { cloudName: 'campusmart' } as { cloudName: string } | null,
    destroy: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
      fn(prisma),
    );
    prisma.user.update.mockImplementation(({ data }: { data: object }) => ({
      ...buyer(),
      ...data,
    }));
    prisma.user.count.mockResolvedValue(0);
    emailCodes.issue.mockResolvedValue('123456');
    institutions.findForEmail.mockResolvedValue({
      id: 'unilag',
      isActive: true,
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        AccountService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: EmailCodesService, useValue: emailCodes },
        { provide: MailService, useValue: mail },
        { provide: InstitutionsService, useValue: institutions },
        { provide: SessionsService, useValue: sessions },
        { provide: CloudinaryService, useValue: cloudinary },
      ],
    }).compile();
    service = moduleRef.get(AccountService);
  });

  describe('setInstitution (T1, G1)', () => {
    it('sets a buyer’s school and empties their cart', async () => {
      prisma.institution.findUnique.mockResolvedValue({ isActive: true });
      await service.setInstitution(buyer({ institutionId: 'old' }), 'unilag');
      expect(prisma.cartItem.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'u1' },
      });
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { institutionId: 'unilag' } }),
      );
    });

    it('does nothing when it’s already their school', async () => {
      prisma.institution.findUnique.mockResolvedValue({ isActive: true });
      await service.setInstitution(
        buyer({ institutionId: 'unilag' }),
        'unilag',
      );
      expect(prisma.cartItem.deleteMany).not.toHaveBeenCalled();
    });

    it('refuses a seller, an unknown school and a switched-off one', async () => {
      const seller = await service
        .setInstitution(buyer({ role: UserRole.SELLER }), 'unilag')
        .catch((e: unknown) => e);
      expect(failure(seller).status).toBe(403);
      prisma.institution.findUnique.mockResolvedValue(null);
      expect(
        failure(await service.setInstitution(buyer(), 'x').catch((e) => e))
          .status,
      ).toBe(404);
      prisma.institution.findUnique.mockResolvedValue({ isActive: false });
      expect(
        failure(await service.setInstitution(buyer(), 'x').catch((e) => e)),
      ).toEqual({ status: 403, code: 'INSTITUTION_INACTIVE' });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('school email (G2)', () => {
    it('sends a code to a listed school’s email and remembers it', async () => {
      await service.sendSchoolEmailCode(buyer(), 'ada@students.unilag.edu.ng');
      expect(emailCodes.assertCanSend).toHaveBeenCalledWith(
        'u1',
        EmailCodePurpose.SCHOOL_EMAIL,
      );
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { pendingSchoolEmail: 'ada@students.unilag.edu.ng' },
      });
      expect(mail.send).toHaveBeenCalledWith(
        'ada@students.unilag.edu.ng',
        'school-email',
        { code: '123456', minutes: 10 },
      );
    });

    it('refuses a non-school email, a taken one and a non-buyer', async () => {
      institutions.findForEmail.mockResolvedValueOnce(null);
      expect(
        failure(
          await service
            .sendSchoolEmailCode(buyer(), 'ada@yahoo.com')
            .catch((e) => e),
        ),
      ).toEqual({ status: 422, code: 'INSTITUTION_NOT_SUPPORTED' });
      prisma.user.count.mockResolvedValueOnce(1);
      expect(
        failure(
          await service
            .sendSchoolEmailCode(buyer(), 'kemi@students.unilag.edu.ng')
            .catch((e) => e),
        ),
      ).toEqual({ status: 409, code: 'EMAIL_TAKEN' });
      expect(
        failure(
          await service
            .sendSchoolEmailCode(
              buyer({ role: UserRole.DISPATCH }),
              'kemi@students.unilag.edu.ng',
            )
            .catch((e) => e),
        ).status,
      ).toBe(403);
      expect(emailCodes.issue).not.toHaveBeenCalled();
    });

    it('confirming the code makes the buyer a seller at that school, audited', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        pendingSchoolEmail: 'ada@students.unilag.edu.ng',
      });
      const seller = await service.verifySchoolEmail(
        buyer({ institutionId: 'lasu' }),
        '123456',
      );
      expect(emailCodes.consume).toHaveBeenCalledWith(
        'u1',
        EmailCodePurpose.SCHOOL_EMAIL,
        '123456',
      );
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: {
          schoolEmail: 'ada@students.unilag.edu.ng',
          schoolEmailVerifiedAt: expect.any(Date),
          pendingSchoolEmail: null,
        },
      });
      // A different school than they shopped at empties the cart
      expect(prisma.cartItem.deleteMany).toHaveBeenCalled();
      expect(prisma.sellerProfile.upsert).toHaveBeenCalled();
      expect(seller).toMatchObject({
        role: UserRole.SELLER,
        institutionId: 'unilag',
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'BECAME_SELLER', actorId: 'u1' }),
        prisma,
      );
    });

    it('asks for a code first when none was sent', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        pendingSchoolEmail: null,
      });
      expect(
        failure(
          await service.verifySchoolEmail(buyer(), '123456').catch((e) => e),
        ),
      ).toEqual({ status: 400, code: 'CODE_EXPIRED' });
      expect(emailCodes.consume).not.toHaveBeenCalled();
    });
  });

  describe('becomeSeller (G2)', () => {
    it('works straight away with a confirmed school email, keeping the cart at the same school', async () => {
      await service.becomeSeller(
        buyer({
          email: 'ada@students.unilag.edu.ng',
          schoolEmail: 'ada@students.unilag.edu.ng',
          schoolEmailVerifiedAt: new Date(),
          institutionId: 'unilag',
        }),
      );
      expect(prisma.cartItem.deleteMany).not.toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { role: UserRole.SELLER, institutionId: 'unilag' },
        }),
      );
    });

    it('needs a confirmed school email', async () => {
      expect(
        failure(
          await service
            .becomeSeller(
              buyer({
                schoolEmail: 'x@unilag.edu.ng',
                schoolEmailVerifiedAt: null,
              }),
            )
            .catch((e) => e),
        ),
      ).toEqual({ status: 400, code: 'SCHOOL_EMAIL_REQUIRED' });
    });
  });

  describe('deleteAccount (T6)', () => {
    beforeEach(() => {
      prisma.sellerOrder.count.mockResolvedValue(0);
      prisma.payout.count.mockResolvedValue(0);
      prisma.verificationRequest.findMany.mockResolvedValue([]);
    });

    it('anonymises the account, signs it out and keeps the orders', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        password: await hash('Campus2026', 4),
      });
      await service.deleteAccount(buyer(), { password: 'Campus2026' });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: expect.objectContaining({
          email: 'deleted+u1@deleted.campusmart.invalid',
          password: null,
          googleId: null,
          firstName: null,
          phone: null,
          schoolEmail: null,
          isActive: false,
          deletedAt: expect.any(Date),
        }),
      });
      expect(sessions.revokeAll).toHaveBeenCalledWith('u1', prisma);
      expect(prisma.listing.updateMany).toHaveBeenCalledWith({
        where: { sellerId: 'u1', isDeleted: false },
        data: { isDeleted: true },
      });
      expect(prisma.order.updateMany).toHaveBeenCalledWith({
        where: { buyerId: 'u1' },
        data: { deliveryAddress: null, buyerPhone: null },
      });
      expect(prisma.sellerProfile.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            payoutAccountName: null,
            contactPhone: null,
          }),
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ACCOUNT_DELETED', actorId: 'u1' }),
        prisma,
      );
    });

    it('removes the student ID photos from Cloudinary', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({ password: null });
      prisma.verificationRequest.findMany.mockResolvedValue([
        {
          documentUrl:
            'https://res.cloudinary.com/campusmart/image/authenticated/s--Ab12Cd34--/v1/campusmart/verification/u1/card.jpg',
        },
      ]);
      await service.deleteAccount(buyer({ role: UserRole.SELLER }), {
        confirm: 'DELETE',
      });
      expect(cloudinary.destroy).toHaveBeenCalledWith(
        ['campusmart/verification/u1/card'],
        'authenticated',
      );
    });

    it('needs the right password, or DELETE for a Google account', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        password: await hash('Campus2026', 4),
      });
      expect(
        failure(
          await service
            .deleteAccount(buyer(), { password: 'Wrong2026x' })
            .catch((e) => e),
        ),
      ).toEqual({ status: 401, code: 'INVALID_PASSWORD' });
      prisma.user.findUniqueOrThrow.mockResolvedValue({ password: null });
      expect(
        failure(await service.deleteAccount(buyer(), {}).catch((e) => e))
          .status,
      ).toBe(400);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('is refused while orders or payouts are open, saying how many', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({ password: null });
      prisma.sellerOrder.count.mockResolvedValue(2);
      const error = await service
        .deleteAccount(buyer(), { confirm: 'DELETE' })
        .catch((e: unknown) => e);
      expect(failure(error)).toEqual({
        status: 409,
        code: 'ACCOUNT_HAS_OPEN_ORDERS',
      });
      expect((error as HttpException).getResponse()).toMatchObject({
        details: { openOrders: 2, openPayouts: 0 },
      });
      prisma.sellerOrder.count.mockResolvedValue(0);
      prisma.payout.count.mockResolvedValue(1);
      expect(
        failure(
          await service
            .deleteAccount(buyer(), { confirm: 'DELETE' })
            .catch((e) => e),
        ).code,
      ).toBe('ACCOUNT_HAS_OPEN_ORDERS');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it.each([UserRole.ADMIN, UserRole.DISPATCH])(
      'refuses a %s',
      async (role) => {
        expect(
          failure(
            await service
              .deleteAccount(buyer({ role }), { confirm: 'DELETE' })
              .catch((e) => e),
          ),
        ).toEqual({ status: 400, code: 'CANNOT_DELETE' });
      },
    );
  });
});
