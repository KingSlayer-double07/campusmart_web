import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { CursorQueryDto } from '../../common/pagination';
import { Trim } from '../../common/transforms';
import {
  ListingStatus,
  UserRole,
  VerificationStatus,
} from '../../generated/prisma/enums';
import { REJECT_REASONS, REPORT_REASONS } from '../moderation-rules';
import type { RejectReason, ReportReason } from '../moderation-rules';

// ── Users ────────────────────────────────────────────────────────────────────

// Riders are managed on the riders screen, and pickup agents went with the stations (DL9)
export const ASSIGNABLE_ROLES = [
  UserRole.BUYER,
  UserRole.SELLER,
  UserRole.ADMIN,
] as const;

export class AdminUsersQueryDto extends CursorQueryDto {
  @ApiPropertyOptional({ description: 'Part of an email or name' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: UserRole, enumName: 'UserRole' })
  @IsOptional()
  @IsIn(Object.values(UserRole))
  role?: UserRole;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  institutionId?: string;

  @ApiPropertyOptional({ description: 'Only suspended users' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  suspended?: boolean;
}

export class AdminUserDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ type: String, nullable: true })
  name!: string | null;

  @ApiProperty({ enum: UserRole, enumName: 'UserRole' })
  role!: UserRole;

  @ApiProperty({ type: String, nullable: true })
  institutionName!: string | null;

  @ApiProperty({ enum: VerificationStatus, enumName: 'VerificationStatus' })
  verificationStatus!: VerificationStatus;

  @ApiProperty()
  emailVerified!: boolean;

  @ApiProperty()
  isSuspended!: boolean;

  @ApiProperty({ type: String, nullable: true })
  suspendedReason!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  suspendedAt!: Date | null;

  @ApiProperty({ description: 'Riders switched off are inactive' })
  isActive!: boolean;

  @ApiProperty()
  createdAt!: Date;
}

export class AdminUserPageDto {
  @ApiProperty({ type: [AdminUserDto] })
  items!: AdminUserDto[];

  @ApiProperty({ type: String, nullable: true })
  nextCursor!: string | null;
}

export class SetRoleDto {
  @ApiProperty({
    enum: ASSIGNABLE_ROLES,
    description:
      'Other admins sign up first, then an admin gives them ADMIN here (M1). Riders are invited on the riders screen.',
  })
  @IsIn(ASSIGNABLE_ROLES, { message: 'role must be BUYER, SELLER or ADMIN' })
  role!: (typeof ASSIGNABLE_ROLES)[number];
}

export class ReasonDto {
  @ApiProperty({
    minLength: 3,
    maxLength: 500,
    description: 'Kept in the audit log; a suspended user sees it (M6)',
  })
  @Trim()
  @IsString()
  @Length(3, 500, { message: 'The reason must be 3 to 500 characters' })
  reason!: string;
}

// ── Listings ─────────────────────────────────────────────────────────────────

export const LISTING_VIEWS = ['REVIEW', 'HIDDEN', 'ALL'] as const;
export type ListingView = (typeof LISTING_VIEWS)[number];

export class AdminListingsQueryDto extends CursorQueryDto {
  @ApiPropertyOptional({
    enum: LISTING_VIEWS,
    default: 'REVIEW',
    description:
      'REVIEW: held by a banned word, or reported. HIDDEN: rejected by an admin. ALL: everything not deleted.',
  })
  @IsOptional()
  @IsIn(LISTING_VIEWS)
  view: ListingView = 'REVIEW';

  @ApiPropertyOptional({ description: 'Part of the title' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class AdminListingDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty({ type: String, nullable: true })
  imageUrl!: string | null;

  @ApiProperty()
  priceKobo!: number;

  @ApiProperty({ enum: ListingStatus, enumName: 'ListingStatus' })
  status!: ListingStatus;

  @ApiProperty({
    description: 'Waiting for a decision; still shown unless FLAGGED',
  })
  isFlagged!: boolean;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  heldAt!: Date | null;

  @ApiProperty({ type: [String], description: 'The banned words it used' })
  heldWords!: string[];

  @ApiProperty({
    description:
      'Buyers have seen it. A prohibited item confirmed on a listing that went live suspends the seller (M4d, M4f).',
  })
  wentLive!: boolean;

  @ApiProperty({ type: String, nullable: true })
  moderationReason!: string | null;

  @ApiProperty({ description: 'Open reports from different users' })
  openReports!: number;

  @ApiProperty({ description: 'Reasons given in the open reports' })
  reportReasons!: string[];

  @ApiProperty({ format: 'uuid' })
  sellerId!: string;

  @ApiProperty()
  storeName!: string;

  @ApiProperty()
  sellerSuspended!: boolean;

  @ApiProperty()
  createdAt!: Date;
}

export class AdminListingPageDto {
  @ApiProperty({ type: [AdminListingDto] })
  items!: AdminListingDto[];

  @ApiProperty({ type: String, nullable: true })
  nextCursor!: string | null;
}

export const MODERATION_ACTIONS = [
  'APPROVE',
  'REJECT',
  'FLAG',
  'UNFLAG',
] as const;
export type ModerationActionInput = (typeof MODERATION_ACTIONS)[number];

export class ModerateListingDto {
  @ApiProperty({
    enum: MODERATION_ACTIONS,
    description:
      'APPROVE: live (again). REJECT: hidden, with a reason the seller sees. FLAG or UNFLAG: in or out of the review queue, still shown.',
  })
  @IsIn(MODERATION_ACTIONS)
  type!: ModerationActionInput;

  @ApiPropertyOptional({
    enum: REJECT_REASONS,
    enumName: 'RejectReason',
    description:
      'Needed to REJECT (M3). PROHIBITED_ITEM on a listing that went live suspends the seller (M4d, M4e).',
  })
  @IsOptional()
  @IsIn(REJECT_REASONS)
  reason?: RejectReason;

  @ApiPropertyOptional({
    maxLength: 500,
    description: 'Shown to the seller with the reason',
  })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  note?: string;
}

// ── Reports ──────────────────────────────────────────────────────────────────

export class ReportListingDto {
  @ApiProperty({ enum: REPORT_REASONS, enumName: 'ReportReason' })
  @IsIn(REPORT_REASONS, { message: 'Choose why you’re reporting it' })
  reason!: ReportReason;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  details?: string;
}

export class ReportReceiptDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    description:
      'True when the listing is now hidden pending review (a prohibited-item report: M4b)',
  })
  hidden!: boolean;
}

export const REPORT_STATUSES = ['OPEN', 'CLOSED'] as const;

export class AdminReportsQueryDto extends CursorQueryDto {
  @ApiPropertyOptional({ enum: REPORT_STATUSES, default: 'OPEN' })
  @IsOptional()
  @IsIn(REPORT_STATUSES)
  status: (typeof REPORT_STATUSES)[number] = 'OPEN';
}

export class AdminReportDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ description: "LISTING, or a support report's type" })
  type!: string;

  @ApiProperty({ type: String, nullable: true })
  reason!: string | null;

  @ApiProperty()
  message!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  listingId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  listingTitle!: string | null;

  @ApiProperty({ description: 'Who reported it' })
  reporterEmail!: string;

  @ApiProperty({ enum: REPORT_STATUSES })
  status!: string;

  @ApiProperty({ type: String, nullable: true })
  resolutionNote!: string | null;

  @ApiProperty()
  createdAt!: Date;
}

export class AdminReportPageDto {
  @ApiProperty({ type: [AdminReportDto] })
  items!: AdminReportDto[];

  @ApiProperty({ type: String, nullable: true })
  nextCursor!: string | null;
}

export class UpdateReportDto {
  @ApiProperty({ enum: REPORT_STATUSES })
  @IsIn(REPORT_STATUSES)
  status!: (typeof REPORT_STATUSES)[number];

  @ApiPropertyOptional({
    minLength: 3,
    maxLength: 500,
    description: 'What was done. Needed to close a report.',
  })
  @ValidateIf(
    (dto: UpdateReportDto) => dto.status === 'CLOSED' || dto.note !== undefined,
  )
  @Trim()
  @IsString()
  @Length(3, 500, { message: 'Say what was done, in 3 to 500 characters' })
  note?: string;
}

// ── Audit log ────────────────────────────────────────────────────────────────

export class AuditQueryDto extends CursorQueryDto {
  @ApiPropertyOptional({ example: 'Listing' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(50)
  entityType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  entityId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  actorId?: string;

  @ApiPropertyOptional({ example: 'USER_SUSPENDED' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(50)
  action?: string;
}

export class AuditEntryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  action!: string;

  @ApiProperty()
  entityType!: string;

  @ApiProperty()
  entityId!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  actorId!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'The admin or user who did it; null for a system job',
  })
  actorEmail!: string | null;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    nullable: true,
  })
  meta!: Record<string, unknown> | null;

  @ApiProperty()
  createdAt!: Date;
}

export class AuditPageDto {
  @ApiProperty({ type: [AuditEntryDto] })
  items!: AuditEntryDto[];

  @ApiProperty({ type: String, nullable: true })
  nextCursor!: string | null;
}

// ── Overview ─────────────────────────────────────────────────────────────────

export class AdminOverviewDto {
  @ApiProperty({ description: 'All accounts' })
  users!: number;

  @ApiProperty()
  sellers!: number;

  @ApiProperty({ description: 'Orders paid in the last 7 days' })
  paidOrders7d!: number;

  @ApiProperty({ description: 'Orders paid in the last 30 days' })
  paidOrders30d!: number;

  @ApiProperty({ description: 'Their totals in the last 30 days, in kobo' })
  gmv30dKobo!: number;

  @ApiProperty({ description: 'Seller payouts held in escrow now, in kobo' })
  escrowHeldKobo!: number;

  @ApiProperty()
  openDisputes!: number;

  @ApiProperty()
  pendingVerifications!: number;

  @ApiProperty()
  failedPayouts!: number;

  @ApiProperty({
    description: 'Held or reported listings waiting for a decision',
  })
  listingsToReview!: number;

  @ApiProperty()
  openReports!: number;

  @ApiProperty()
  suspendedUsers!: number;
}
