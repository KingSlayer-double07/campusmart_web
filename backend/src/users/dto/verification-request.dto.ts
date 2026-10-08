import { ApiProperty } from '@nestjs/swagger';
import { VerificationStatus } from '../../generated/prisma/enums';

export class VerificationRequestDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: VerificationStatus, enumName: 'VerificationStatus' })
  status!: VerificationStatus;

  @ApiProperty()
  documentUrl!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}
