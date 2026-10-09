import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  Length,
  ValidateIf,
} from 'class-validator';
import { CursorQueryDto } from '../../common/pagination';
import { Trim } from '../../common/transforms';
import { VerificationStatus } from '../../generated/prisma/enums';

export const REVIEW_QUEUES = ['PENDING', 'VERIFIED', 'REJECTED'] as const;
export type ReviewQueue = (typeof REVIEW_QUEUES)[number];

export class ListVerificationRequestsQueryDto extends CursorQueryDto {
  @ApiPropertyOptional({
    enum: REVIEW_QUEUES,
    enumName: 'ReviewQueue',
    default: 'PENDING',
    description: 'PENDING lists oldest first; decided requests newest first',
  })
  @IsOptional()
  @IsIn(REVIEW_QUEUES)
  status: ReviewQueue = 'PENDING';
}

export const DECISIONS = ['VERIFIED', 'REJECTED'] as const;
export type Decision = (typeof DECISIONS)[number];

export class DecideVerificationDto {
  @ApiProperty({ enum: DECISIONS, enumName: 'VerificationDecision' })
  @IsIn(DECISIONS, { message: 'Choose VERIFIED or REJECTED' })
  decision!: Decision;

  @ApiPropertyOptional({
    minLength: 3,
    maxLength: 500,
    description:
      'Required when rejecting. The seller sees it, so say what to fix.',
  })
  @ValidateIf(
    (dto: DecideVerificationDto) =>
      dto.decision === 'REJECTED' || dto.note !== undefined,
  )
  @Trim()
  @IsString({ message: 'Tell the seller why' })
  @Length(3, 500, { message: 'The note must be 3 to 500 characters' })
  note?: string;
}

export class VerificationSellerDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, nullable: true })
  firstName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName!: string | null;

  @ApiProperty({ description: 'Admins see it to match the ID card' })
  email!: string;

  @ApiProperty({ type: String, nullable: true })
  storeName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  institutionName!: string | null;
}

export class AdminVerificationRequestDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: VerificationStatus, enumName: 'VerificationStatus' })
  status!: VerificationStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  reviewedAt!: Date | null;

  @ApiProperty({ type: String, nullable: true })
  reviewNote!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'A link to the private ID photo that expires after 10 minutes. Null when the document is not a CampusMart upload or uploads are not set up.',
  })
  documentViewUrl!: string | null;

  @ApiProperty({ type: VerificationSellerDto })
  seller!: VerificationSellerDto;
}

export class AdminVerificationPageDto {
  @ApiProperty({ type: [AdminVerificationRequestDto] })
  items!: AdminVerificationRequestDto[];

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  nextCursor!: string | null;
}
