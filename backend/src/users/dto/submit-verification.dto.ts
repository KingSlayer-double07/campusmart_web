import { ApiProperty } from '@nestjs/swagger';
import { IsUrl } from 'class-validator';

export class SubmitVerificationDto {
  @ApiProperty({
    description: 'Verification URL or data associated with the verification',
    type: String,
    example: 'https://example.com/verify',
  })
  @IsUrl({}, { message: 'Verification data must be a valid URL' })
  verificationData!: string;
}
