import { ApiProperty } from '@nestjs/swagger';
import { UserRole, VerificationStatus } from '../../generated/prisma/enums';

// Another user's public card: name, role, verification, trust score, institution, join date. No email.
export class PublicProfileDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, nullable: true })
  firstName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName!: string | null;

  @ApiProperty({ enum: UserRole, enumName: 'UserRole' })
  role!: UserRole;

  @ApiProperty({ enum: VerificationStatus, enumName: 'VerificationStatus' })
  verificationStatus!: VerificationStatus;

  @ApiProperty()
  trustScore!: number;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  institutionId!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}
