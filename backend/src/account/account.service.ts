import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { compare } from 'bcrypt';
import type { AuthUser, SafeUser } from '../auth/auth-user';
import {
  CODE_TTL_MINUTES,
  EmailCodeError,
  EmailCodesService,
} from '../auth/email-codes.service';
import { AuditService } from '../audit/audit.service';
import { openSellerOrderWhere } from '../common/open-seller-orders';
import { Prisma } from '../generated/prisma/client';
import {
  EmailCodePurpose,
  PayoutStatus,
  UserRole,
} from '../generated/prisma/enums';
import { institutionInactive } from '../institutions/institution-access';
import { InstitutionsService } from '../institutions/institutions.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { SessionsService } from '../sessions/sessions.service';
import { CloudinaryService } from '../uploads/cloudinary.service';
import { parseImageUrl } from '../uploads/cloudinary-urls';
import { safeUserSelect } from '../users/user.select';
import type { DeleteAccountDto } from './dto/account.dto';

type Tx = Prisma.TransactionClient;

// Decisions T1, G1, G2 and G4: a buyer picks or changes their school, and becomes a seller with a
// confirmed school email.
@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly emailCodes: EmailCodesService,
    private readonly mail: MailService,
    private readonly institutions: InstitutionsService,
    private readonly sessions: SessionsService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  // Onboarding and the profile (G1). Changing school empties the cart, whose items belong to the old
  // school. A school that isn't listed goes to the waitlist instead (G4).
  async setInstitution(
    user: AuthUser,
    institutionId: string,
  ): Promise<SafeUser> {
    if (user.role !== UserRole.BUYER) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: "A seller's school comes from their school email",
      });
    }
    const institution = await this.prisma.institution.findUnique({
      where: { id: institutionId },
      select: { isActive: true },
    });
    if (!institution) throw new NotFoundException('School not found');
    if (!institution.isActive) throw institutionInactive();
    if (user.institutionId === institutionId) return user;

    return this.prisma.$transaction(async (tx) => {
      await tx.cartItem.deleteMany({ where: { userId: user.id } });
      return tx.user.update({
        where: { id: user.id },
        data: { institutionId },
        select: safeUserSelect,
      });
    });
  }

  // G2: send a code to the school email a buyer wants to sell with
  async sendSchoolEmailCode(user: AuthUser, email: string): Promise<void> {
    this.assertBuyer(user);
    if (user.schoolEmailVerifiedAt && user.schoolEmail === email) {
      throw new BadRequestException({
        code: 'ALREADY_VERIFIED',
        message:
          'That school email is already confirmed. You can start selling now.',
      });
    }
    await this.schoolFor(email);
    await this.assertEmailFree(user.id, email);
    await this.emailCodes.assertCanSend(user.id, EmailCodePurpose.SCHOOL_EMAIL);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { pendingSchoolEmail: email },
    });
    const code = await this.emailCodes.issue(
      user.id,
      EmailCodePurpose.SCHOOL_EMAIL,
    );
    try {
      await this.mail.send(email, 'school-email', {
        code,
        minutes: CODE_TTL_MINUTES,
      });
    } catch (error) {
      // The buyer can ask for another code in a minute
      this.logger.error(
        `Could not send the school email code to user ${user.id}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  // G2: confirming the code makes the buyer a seller at that school
  async verifySchoolEmail(user: AuthUser, code: string): Promise<SafeUser> {
    this.assertBuyer(user);
    const pending = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { pendingSchoolEmail: true },
    });
    if (!pending.pendingSchoolEmail) {
      throw new EmailCodeError({
        code: 'CODE_EXPIRED',
        message: 'Ask for a code first',
      });
    }
    await this.emailCodes.consume(user.id, EmailCodePurpose.SCHOOL_EMAIL, code);
    const email = pending.pendingSchoolEmail;
    const institution = await this.schoolFor(email);
    await this.assertEmailFree(user.id, email);
    return this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          schoolEmail: email,
          schoolEmailVerifiedAt: new Date(),
          pendingSchoolEmail: null,
        },
      });
      return this.makeSeller(tx, user, institution.id);
    });
  }

  // G2: a buyer whose school email is already confirmed (their account email, or one added before)
  async becomeSeller(user: AuthUser): Promise<SafeUser> {
    this.assertBuyer(user);
    if (!user.schoolEmail || !user.schoolEmailVerifiedAt) {
      throw new BadRequestException({
        code: 'SCHOOL_EMAIL_REQUIRED',
        message: 'Add and confirm your school email to start selling',
      });
    }
    const institution = await this.schoolFor(user.schoolEmail);
    return this.prisma.$transaction((tx) =>
      this.makeSeller(tx, user, institution.id),
    );
  }

  // D8: a seller has a store (an empty SellerProfile) and belongs to their school email's school.
  // A different school than they shopped at empties the cart, as a school change does (G1).
  private async makeSeller(tx: Tx, user: AuthUser, institutionId: string) {
    if (user.institutionId !== institutionId) {
      await tx.cartItem.deleteMany({ where: { userId: user.id } });
    }
    await tx.sellerProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
    });
    const seller = await tx.user.update({
      where: { id: user.id },
      data: { role: UserRole.SELLER, institutionId },
      select: safeUserSelect,
    });
    await this.audit.record(
      {
        actorId: user.id,
        action: 'BECAME_SELLER',
        entityType: 'User',
        entityId: user.id,
        meta: { schoolEmail: seller.schoolEmail, institutionId },
      },
      tx,
    );
    return seller;
  }

  // Decision T6 (and guide 10): personal details are anonymised and the account can't be used again;
  // orders, payments and payouts stay as records for 6 years. Refused while orders or payouts are open.
  async deleteAccount(user: AuthUser, dto: DeleteAccountDto): Promise<void> {
    if (user.role !== UserRole.BUYER && user.role !== UserRole.SELLER) {
      throw new BadRequestException({
        code: 'CANNOT_DELETE',
        message:
          user.role === UserRole.ADMIN
            ? 'Ask another admin to remove your admin role first'
            : 'Ask an admin to switch off your rider account',
      });
    }
    const account = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { password: true },
    });
    if (account.password) {
      if (!dto.password || !(await compare(dto.password, account.password))) {
        throw new UnauthorizedException({
          code: 'INVALID_PASSWORD',
          message: 'That password is incorrect',
        });
      }
    } else if (dto.confirm !== 'DELETE') {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Type DELETE to confirm',
      });
    }

    const [openOrders, openPayouts] = await Promise.all([
      this.prisma.sellerOrder.count({
        where: {
          AND: [
            openSellerOrderWhere(),
            { OR: [{ sellerId: user.id }, { order: { buyerId: user.id } }] },
          ],
        },
      }),
      this.prisma.payout.count({
        where: { sellerId: user.id, status: { not: PayoutStatus.PAID } },
      }),
    ]);
    if (openOrders || openPayouts) {
      throw new ConflictException({
        code: 'ACCOUNT_HAS_OPEN_ORDERS',
        message: openOrders
          ? `You have ${openOrders} order${openOrders === 1 ? '' : 's'} in progress. Delete your account once they're finished and the 48-hour window has passed.`
          : 'A payout to you hasn’t been paid yet. Delete your account once it has.',
        details: { openOrders, openPayouts },
      });
    }

    const documents = await this.prisma.verificationRequest.findMany({
      where: { userId: user.id },
      select: { documentUrl: true },
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          email: `deleted+${user.id}@deleted.campusmart.invalid`,
          password: null,
          googleId: null,
          username: null,
          firstName: null,
          lastName: null,
          phone: null,
          schoolEmail: null,
          schoolEmailVerifiedAt: null,
          pendingSchoolEmail: null,
          notificationPrefs: Prisma.DbNull,
          isActive: false,
          deletedAt: new Date(),
        },
      });
      await this.sessions.revokeAll(user.id, tx);
      await tx.cartItem.deleteMany({ where: { userId: user.id } });
      await tx.wishlist.deleteMany({ where: { userId: user.id } });
      await tx.notification.deleteMany({ where: { userId: user.id } });
      await tx.emailCode.deleteMany({ where: { userId: user.id } });
      await tx.verificationRequest.deleteMany({ where: { userId: user.id } });
      await tx.listing.updateMany({
        where: { sellerId: user.id, isDeleted: false },
        data: { isDeleted: true },
      });
      // The orders stay, but the address and phone the buyer gave the rider are personal details
      await tx.order.updateMany({
        where: { buyerId: user.id },
        data: { deliveryAddress: null, buyerPhone: null },
      });
      await tx.sellerProfile.updateMany({
        where: { userId: user.id },
        data: {
          storeName: null,
          bio: null,
          logoUrl: null,
          isOnline: false,
          payoutBankName: null,
          payoutAccountLast4: null,
          payoutAccountName: null,
          paystackRecipientCode: null,
          payoutBankCode: null,
          pickupArea: null,
          pickupAddress: null,
          contactPhone: null,
          allowsPickup: false,
        },
      });
      await this.audit.record(
        {
          actorId: user.id,
          action: 'ACCOUNT_DELETED',
          entityType: 'User',
          entityId: user.id,
          meta: { role: user.role },
        },
        tx,
      );
    });

    // The student ID photos are private uploads; they go too (best effort)
    const cloudName = this.cloudinary.settings?.cloudName;
    const ids = cloudName
      ? documents
          .map((d) => parseImageUrl(d.documentUrl, cloudName))
          .filter((d) => d?.type === 'authenticated')
          .map((d) => d!.publicId)
      : [];
    if (ids.length) void this.cloudinary.destroy(ids, 'authenticated');
  }

  private assertBuyer(user: AuthUser) {
    if (user.role !== UserRole.BUYER) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Only a buyer account can become a seller',
      });
    }
  }

  // The school behind a school email; sellers need one that's listed and switched on (D7, G4)
  private async schoolFor(email: string) {
    const institution = await this.institutions.findForEmail(email);
    if (!institution) {
      throw new UnprocessableEntityException({
        code: 'INSTITUTION_NOT_SUPPORTED',
        message: "That email isn't from a school on CampusMart yet",
      });
    }
    if (!institution.isActive) throw institutionInactive();
    return institution;
  }

  private async assertEmailFree(userId: string, email: string) {
    const taken = await this.prisma.user.count({
      where: {
        id: { not: userId },
        OR: [{ email }, { schoolEmail: email }],
      },
    });
    if (taken) {
      throw new ConflictException({
        code: 'EMAIL_TAKEN',
        message: 'Another account already uses that email',
      });
    }
  }
}
