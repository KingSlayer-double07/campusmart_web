import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { UPLOAD_PURPOSES, type UploadPurpose } from '../cloudinary-urls';

export class UploadSignatureRequestDto {
  @ApiProperty({ enum: UPLOAD_PURPOSES, enumName: 'UploadPurpose' })
  @IsIn(UPLOAD_PURPOSES, {
    message: 'purpose must be LISTING, AVATAR or VERIFICATION',
  })
  purpose!: UploadPurpose;
}

// Everything the browser sends to https://api.cloudinary.com/v1_1/<cloudName>/image/upload
export class UploadSignatureDto {
  @ApiProperty({ example: 'campusmart' })
  cloudName!: string;

  @ApiProperty({ description: 'The public API key (not the secret)' })
  apiKey!: string;

  @ApiProperty({
    description: 'Unix seconds; Cloudinary rejects it after an hour',
  })
  timestamp!: number;

  @ApiProperty()
  signature!: string;

  @ApiProperty({ example: 'campusmart/listings/3f8a…' })
  folder!: string;

  @ApiPropertyOptional({
    enum: ['authenticated'],
    description: 'Sent for VERIFICATION uploads, which must not be public',
  })
  type?: 'authenticated';
}
