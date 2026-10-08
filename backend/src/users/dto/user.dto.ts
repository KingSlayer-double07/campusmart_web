import { ApiProperty } from '@nestjs/swagger';
import { UserRole, VerificationStatus } from '../../generated/prisma/enums';
import type { SafeUser } from '../../auth/auth-user';

// The signed-in user's own account. Never includes the password hash or other users' data.
export class UserDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'email' })
  email!: string;

  @ApiProperty({ type: String, nullable: true })
  username!: string | null;

  @ApiProperty({ type: String, nullable: true })
  firstName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName!: string | null;

  @ApiProperty({ enum: UserRole, enumName: 'UserRole' })
  role!: UserRole;

  @ApiProperty({ enum: VerificationStatus, enumName: 'VerificationStatus' })
  verificationStatus!: VerificationStatus;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'Set once the 6-digit email code is verified; required before buying or selling',
  })
  emailVerifiedAt!: Date | null;

  @ApiProperty()
  trustScore!: number;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  institutionId!: string | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  isSuspended!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}

// Picks exactly the documented fields (drops e.g. the sessionId JwtStrategy adds to req.user)
export function toUserDto(user: SafeUser): UserDto {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    verificationStatus: user.verificationStatus,
    emailVerifiedAt: user.emailVerifiedAt,
    trustScore: user.trustScore,
    institutionId: user.institutionId,
    isActive: user.isActive,
    isSuspended: user.isSuspended,
    createdAt: user.createdAt,
  };
}
