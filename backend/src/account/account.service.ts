import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { AuthUser, SafeUser } from '../auth/auth-user';
import {
  CODE_TTL_MINUTES,
  EmailCodeError,
  EmailCodesService,
} from '../auth/email-codes.service';
import { AuditService } from '../audit/audit.service';
import type { Prisma } from '../generated/prisma/client';
import { EmailCodePurpose, UserRole } from '../generated/prisma/enums';
import { institutionInactive } from '../institutions/institution-access';
import { InstitutionsService } from '../institutions/institutions.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { safeUserSelect } from '../users/user.select';

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
