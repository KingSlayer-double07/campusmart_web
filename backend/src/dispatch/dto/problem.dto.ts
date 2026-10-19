import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { CursorQueryDto } from '../../common/pagination';
import { Trim } from '../../common/transforms';
import {
  DeliveryMethod,
  DisputeStatus,
  Fault,
  ProblemStatus,
  UserRole,
} from '../../generated/prisma/enums';

// Decision F6: why the buyer disputes an order they received
export const DISPUTE_REASONS = [
  'NOT_AS_DESCRIBED',
  'DAMAGED',
  'WRONG_ITEM',
  'MISSING_ITEMS',
  'OTHER',
] as const;
// Decision C8: before handover, a problem alerts the admins (a late rider, a lost parcel)
export const EARLY_PROBLEM_REASONS = ['LATE', 'LOST', 'OTHER'] as const;
// Decision DL8: the rider reports a buyer who didn't show
export const RIDER_PROBLEM_REASONS = ['BUYER_NO_SHOW', 'OTHER'] as const;

export const BUYER_PROBLEM_REASONS = [
  ...new Set([...EARLY_PROBLEM_REASONS, ...DISPUTE_REASONS]),
] as const;

export class ReportProblemDto {
  @ApiProperty({
    enum: BUYER_PROBLEM_REASONS,
    enumName: 'BuyerProblemReason',
    description:
      'Before handover: LATE, LOST or OTHER. After handover: NOT_AS_DESCRIBED, DAMAGED, WRONG_ITEM, MISSING_ITEMS or OTHER.',
  })
  @IsIn(BUYER_PROBLEM_REASONS, { message: 'Choose what went wrong' })
  reason!: (typeof BUYER_PROBLEM_REASONS)[number];

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(1000)
  details?: string;

  @ApiPropertyOptional({
    type: [String],
    maxItems: 3,
    description: 'Up to 3 photos uploaded with purpose DISPUTE (F7)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3, { message: 'Add up to 3 photos' })
  @IsUrl({ protocols: ['https'], require_protocol: true }, { each: true })
  evidenceUrls?: string[];
}

export class RiderProblemDto {
  @ApiProperty({ enum: RIDER_PROBLEM_REASONS, enumName: 'RiderProblemReason' })
  @IsIn(RIDER_PROBLEM_REASONS, { message: 'Choose what went wrong' })
  reason!: (typeof RIDER_PROBLEM_REASONS)[number];

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(1000)
  details?: string;
}

export class ReportResultDto {
  @ApiProperty({
    enum: ['PROBLEM', 'DISPUTE'],
    description:
      'PROBLEM: before handover, the admins were alerted. DISPUTE: after handover, the payout is held until an admin decides.',
  })
  kind!: 'PROBLEM' | 'DISPUTE';

  @ApiProperty({ format: 'uuid' })
  id!: string;
}

export class ListDisputesQueryDto extends CursorQueryDto {
  @ApiPropertyOptional({
    enum: ['OPEN', 'RESOLVED'],
    default: 'OPEN',
  })
  @IsOptional()
  @IsIn(['OPEN', 'RESOLVED'])
  status: 'OPEN' | 'RESOLVED' = 'OPEN';
}

export class ListProblemsQueryDto extends CursorQueryDto {
  @ApiPropertyOptional({
    enum: ProblemStatus,
    enumName: 'ProblemStatus',
    default: 'OPEN',
  })
  @IsOptional()
  @IsIn(Object.values(ProblemStatus))
  status: ProblemStatus = ProblemStatus.OPEN;
}

export class AdminDisputeDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  sellerOrderId!: string;

  @ApiProperty({ format: 'uuid' })
  orderId!: string;

  @ApiProperty({ example: 'CM-7F3K2Q' })
  code!: string;

  @ApiProperty()
  storeName!: string;

  @ApiProperty()
  buyerName!: string;

  @ApiProperty({ enum: DISPUTE_REASONS, enumName: 'DisputeReason' })
  reason!: string;

  @ApiProperty({ type: String, nullable: true })
  details!: string | null;

  @ApiProperty({ type: [String] })
  evidenceUrls!: string[];

  @ApiProperty({ enum: DisputeStatus, enumName: 'DisputeStatus' })
  status!: DisputeStatus;

  @ApiProperty({ enum: Fault, enumName: 'Fault', nullable: true })
  fault!: Fault | null;

  @ApiProperty({ type: String, nullable: true })
  resolutionNote!: string | null;

  @ApiProperty({
    enum: DeliveryMethod,
    enumName: 'DeliveryMethod',
    nullable: true,
  })
  deliveryMethod!: DeliveryMethod | null;

  @ApiProperty({ description: 'The items, in kobo' })
  subtotalKobo!: number;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  handedOverAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  resolvedAt!: Date | null;
}

export class AdminDisputePageDto {
  @ApiProperty({ type: [AdminDisputeDto] })
  items!: AdminDisputeDto[];

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  nextCursor!: string | null;
}

// Decision F8: a full refund of that store's order, or a full release to the seller. A refund
// says whose fault it was (P6); an item to return is arranged outside the app (F9).
export class ResolveDisputeDto {
  @ApiProperty({ enum: ['REFUND', 'RELEASE'] })
  @IsIn(['REFUND', 'RELEASE'])
  outcome!: 'REFUND' | 'RELEASE';

  @ApiPropertyOptional({
    enum: Fault,
    enumName: 'Fault',
    description: 'Needed for a refund',
  })
  @ValidateIf((dto: ResolveDisputeDto) => dto.outcome === 'REFUND')
  @IsIn(Object.values(Fault), { message: 'Say whose fault it was' })
  fault?: Fault;

  @ApiProperty({
    minLength: 3,
    maxLength: 1000,
    description: 'Both sides see it',
  })
  @Trim()
  @IsString()
  @Length(3, 1000, { message: 'Explain the decision in 3 to 1000 characters' })
  note!: string;
}

export class AdminProblemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  orderId!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  sellerOrderId!: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'CM-7F3K2Q' })
  code!: string | null;

  @ApiProperty({ type: String, nullable: true })
  storeName!: string | null;

  @ApiProperty({ enum: UserRole, enumName: 'UserRole' })
  reporterRole!: UserRole;

  @ApiProperty()
  reporterName!: string;

  @ApiProperty({ example: 'LATE' })
  reason!: string;

  @ApiProperty({ type: String, nullable: true })
  details!: string | null;

  @ApiProperty({ enum: ProblemStatus, enumName: 'ProblemStatus' })
  status!: ProblemStatus;

  @ApiProperty({ type: String, nullable: true })
  resolutionNote!: string | null;

  @ApiProperty({
    type: [String],
    description: 'Where each store of the order stands now',
    example: ['CM-7F3K2Q: WITH_RIDER'],
  })
  storeStates!: string[];

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}

export class AdminProblemPageDto {
  @ApiProperty({ type: [AdminProblemDto] })
  items!: AdminProblemDto[];

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  nextCursor!: string | null;
}

export class CloseProblemDto {
  @ApiProperty({ minLength: 3, maxLength: 1000 })
  @Trim()
  @IsString()
  @Length(3, 1000, { message: 'Say what was done, in 3 to 1000 characters' })
  note!: string;
}

// Decisions DX6 and DL8: a parcel lost with the rider, or a buyer who didn't show; the admin
// decides each case and whose fault it was
export class AdminRefundDto {
  @ApiProperty({ enum: Fault, enumName: 'Fault' })
  @IsIn(Object.values(Fault), { message: 'Say whose fault it was' })
  fault!: Fault;

  @ApiProperty({ minLength: 3, maxLength: 500 })
  @Trim()
  @IsString()
  @Length(3, 500, { message: 'The reason must be 3 to 500 characters' })
  reason!: string;
}

export class ClosedProblemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  closed!: boolean;
}

export class AdminRefundResultDto {
  @ApiProperty({ format: 'uuid' })
  sellerOrderId!: string;

  @ApiProperty()
  refunded!: boolean;
}
