import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { CursorQueryDto } from '../../common/pagination';
import { Trim } from '../../common/transforms';
import { PaymentMethod, PayoutStatus } from '../../generated/prisma/enums';
import { SETTINGS } from '../../settings/settings.service';

export class PaymentConfigDto {
  @ApiProperty({
    description:
      'false until Paystack is switched on; checkout then places the order without a payment page',
  })
  paymentsEnabled!: boolean;

  @ApiProperty({
    enum: PaymentMethod,
    enumName: 'PaymentMethod',
    isArray: true,
    description:
      'What checkout offers. OPay and PalmPay appear once Paystack confirms them (decision P5).',
  })
  methods!: PaymentMethod[];
}

export class StartedPaymentDto {
  @ApiProperty({ description: "Paystack's payment page" })
  authorizationUrl!: string;

  @ApiProperty({ example: 'CM_7d3f5b2e-1c4a-4f6e-9b8d-2a1c3e5f7a9b_2' })
  reference!: string;
}

export class VerifiedPaymentDto {
  @ApiProperty({ format: 'uuid' })
  orderId!: string;

  @ApiProperty({ enum: ['PENDING_PAYMENT', 'PAID', 'CANCELLED', 'EXPIRED'] })
  status!: string;
}

export class BankDto {
  @ApiProperty({ example: 'Guaranty Trust Bank' })
  name!: string;

  @ApiProperty({ example: '058' })
  code!: string;
}

export class SetPayoutAccountDto {
  @ApiProperty({
    example: '058',
    description: 'A code from GET /payouts/banks',
  })
  @Trim()
  @Matches(/^\w{1,12}$/, { message: 'Choose your bank from the list' })
  bankCode!: string;

  @ApiProperty({ example: '0123456789', description: '10-digit NUBAN' })
  @Trim()
  @Matches(/^\d{10}$/, { message: 'Enter your 10-digit account number' })
  accountNumber!: string;
}

export class PayoutAccountDto {
  @ApiProperty({ type: String, nullable: true })
  bankName!: string | null;

  @ApiProperty({ type: String, nullable: true, example: '6789' })
  accountLast4!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'The name the bank has on the account',
  })
  accountName!: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'Payouts wait until then after an account change (decision P9)',
  })
  holdUntil!: Date | null;
}

export class PayoutDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'CM-7F3K2Q' })
  sellerOrderCode!: string;

  @ApiProperty({ description: 'Items less the platform fee, in kobo' })
  amountKobo!: number;

  @ApiProperty({ enum: PayoutStatus, enumName: 'PayoutStatus' })
  status!: PayoutStatus;

  @ApiProperty({ type: String, nullable: true })
  failureReason!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  paidAt!: Date | null;
}

export class PayoutPageDto {
  @ApiProperty({ type: [PayoutDto] })
  items!: PayoutDto[];

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  nextCursor!: string | null;
}

export class AdminPayoutDto extends PayoutDto {
  @ApiProperty({ format: 'uuid' })
  sellerId!: string;

  @ApiProperty()
  storeName!: string;

  @ApiProperty({ description: 'Transfers tried so far' })
  attempt!: number;
}

export class AdminPayoutPageDto {
  @ApiProperty({ type: [AdminPayoutDto] })
  items!: AdminPayoutDto[];

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  nextCursor!: string | null;
}

export class ListAdminPayoutsQueryDto extends CursorQueryDto {
  @ApiPropertyOptional({ enum: PayoutStatus, enumName: 'PayoutStatus' })
  @IsOptional()
  @IsEnum(PayoutStatus)
  status?: PayoutStatus;
}

export class SettingsDto {
  @ApiProperty({ description: SETTINGS.platformFeeBps.label, example: 0 })
  platformFeeBps!: number;

  @ApiProperty({ description: SETTINGS.pickupDeadlineDays.label, example: 3 })
  pickupDeadlineDays!: number;

  @ApiProperty({ description: SETTINGS.lowStockThreshold.label, example: 5 })
  lowStockThreshold!: number;

  @ApiProperty({ description: SETTINGS.trustWeightRating.label, example: 50 })
  trustWeightRating!: number;

  @ApiProperty({
    description: SETTINGS.trustWeightCompleted.label,
    example: 30,
  })
  trustWeightCompleted!: number;

  @ApiProperty({ description: SETTINGS.trustWeightVerified.label, example: 20 })
  trustWeightVerified!: number;

  @ApiProperty({
    description: SETTINGS.trustPenaltySellerFault.label,
    example: 10,
  })
  trustPenaltySellerFault!: number;
}

export class UpdateSettingsDto {
  @ApiPropertyOptional({
    minimum: SETTINGS.platformFeeBps.min,
    maximum: SETTINGS.platformFeeBps.max,
    description: SETTINGS.platformFeeBps.label,
  })
  @IsOptional()
  @IsInt()
  @Min(SETTINGS.platformFeeBps.min)
  @Max(SETTINGS.platformFeeBps.max, {
    message: 'The platform fee can be up to 50%',
  })
  platformFeeBps?: number;

  @ApiPropertyOptional({
    minimum: SETTINGS.pickupDeadlineDays.min,
    maximum: SETTINGS.pickupDeadlineDays.max,
    description: SETTINGS.pickupDeadlineDays.label,
  })
  @IsOptional()
  @IsInt()
  @Min(SETTINGS.pickupDeadlineDays.min)
  @Max(SETTINGS.pickupDeadlineDays.max)
  pickupDeadlineDays?: number;

  @ApiPropertyOptional({
    minimum: SETTINGS.lowStockThreshold.min,
    maximum: SETTINGS.lowStockThreshold.max,
    description: SETTINGS.lowStockThreshold.label,
  })
  @IsOptional()
  @IsInt()
  @Min(SETTINGS.lowStockThreshold.min)
  @Max(SETTINGS.lowStockThreshold.max)
  lowStockThreshold?: number;

  @ApiPropertyOptional({
    minimum: SETTINGS.trustWeightRating.min,
    maximum: SETTINGS.trustWeightRating.max,
    description: SETTINGS.trustWeightRating.label,
  })
  @IsOptional()
  @IsInt()
  @Min(SETTINGS.trustWeightRating.min)
  @Max(SETTINGS.trustWeightRating.max)
  trustWeightRating?: number;

  @ApiPropertyOptional({
    minimum: SETTINGS.trustWeightCompleted.min,
    maximum: SETTINGS.trustWeightCompleted.max,
    description: SETTINGS.trustWeightCompleted.label,
  })
  @IsOptional()
  @IsInt()
  @Min(SETTINGS.trustWeightCompleted.min)
  @Max(SETTINGS.trustWeightCompleted.max)
  trustWeightCompleted?: number;

  @ApiPropertyOptional({
    minimum: SETTINGS.trustWeightVerified.min,
    maximum: SETTINGS.trustWeightVerified.max,
    description: SETTINGS.trustWeightVerified.label,
  })
  @IsOptional()
  @IsInt()
  @Min(SETTINGS.trustWeightVerified.min)
  @Max(SETTINGS.trustWeightVerified.max)
  trustWeightVerified?: number;

  @ApiPropertyOptional({
    minimum: SETTINGS.trustPenaltySellerFault.min,
    maximum: SETTINGS.trustPenaltySellerFault.max,
    description: SETTINGS.trustPenaltySellerFault.label,
  })
  @IsOptional()
  @IsInt()
  @Min(SETTINGS.trustPenaltySellerFault.min)
  @Max(SETTINGS.trustPenaltySellerFault.max)
  trustPenaltySellerFault?: number;
}
