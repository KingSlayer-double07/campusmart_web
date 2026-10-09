import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUrl, MaxLength } from 'class-validator';
import { VerificationStatus } from '../../generated/prisma/enums';
import { Trim } from '../../common/transforms';

export class SubmitVerificationDto {
  @ApiProperty({
    maxLength: 500,
    description:
      'secure_url of a student ID photo uploaded with purpose VERIFICATION (a private, authenticated upload)',
  })
  @Trim()
  @IsString()
  @MaxLength(500)
  @IsUrl(
    { protocols: ['https'], require_protocol: true },
    { message: 'Upload a photo of your student ID' },
  )
  documentUrl!: string;
}

// What the seller sees about one request. The document itself never comes back.
export class VerificationRequestDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: VerificationStatus, enumName: 'VerificationStatus' })
  status!: VerificationStatus;

  @ApiProperty({
    type: String,
    nullable: true,
    description: "The admin's reason, set when the request was rejected",
  })
  reviewNote!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  reviewedAt!: Date | null;
}

export class MyVerificationDto {
  @ApiProperty({
    enum: VerificationStatus,
    enumName: 'VerificationStatus',
    description: 'Only VERIFIED sellers can publish listings',
  })
  status!: VerificationStatus;

  @ApiProperty({ type: VerificationRequestDto, nullable: true })
  latestRequest!: VerificationRequestDto | null;
}
