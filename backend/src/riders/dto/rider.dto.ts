import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { NormalizeEmail } from '../../auth/dto/normalize-email';
import { PHONE_MESSAGE, PHONE_RE } from '../../common/phone';
import { Trim } from '../../common/transforms';
import { AdminListQueryDto } from '../../admin/dto/active-toggle.dto';
import { StationInstitutionDto } from '../../admin/dto/pickup-station.dto';

// Decision DX1: an admin invites a rider by email and picks their campus
export class InviteRiderDto {
  @ApiProperty({ format: 'email', example: 'musa.rider@gmail.com' })
  @NormalizeEmail()
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(254)
  email!: string;

  @ApiProperty({ format: 'uuid', description: 'The campus they deliver at' })
  @IsUUID('all', { message: 'Choose an institution' })
  institutionId!: string;

  @ApiProperty({ minLength: 1, maxLength: 50, example: 'Musa' })
  @Trim()
  @IsString()
  @Length(1, 50, { message: 'Enter their first name' })
  firstName!: string;

  @ApiPropertyOptional({ maxLength: 50, example: 'Bello' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(50)
  lastName?: string;

  @ApiPropertyOptional({
    example: '+234 803 555 0101',
    description: 'Shown to admins only',
  })
  @IsOptional()
  @Trim()
  @Matches(PHONE_RE, { message: PHONE_MESSAGE })
  phone?: string;
}

export class ListRidersQueryDto extends AdminListQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  institutionId?: string;
}

export class AdminRiderDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'email' })
  email!: string;

  @ApiProperty({ type: String, nullable: true })
  firstName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  phone!: string | null;

  @ApiProperty({ description: 'Switched off riders can’t sign in or see jobs' })
  isActive!: boolean;

  @ApiProperty({
    description: 'True until they set their password from the invite link',
  })
  invitePending!: boolean;

  @ApiProperty({ type: StationInstitutionDto })
  institution!: StationInstitutionDto;

  @ApiProperty({ description: 'Jobs they hold now' })
  activeJobs!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}

export class AdminRiderPageDto {
  @ApiProperty({ type: [AdminRiderDto] })
  items!: AdminRiderDto[];

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  nextCursor!: string | null;
}

export class InviteInfoDto {
  @ApiProperty({ format: 'email' })
  email!: string;

  @ApiProperty({ type: String, nullable: true })
  firstName!: string | null;

  @ApiProperty({ example: 'University of Lagos' })
  institutionName!: string;
}

// Switching a rider off or on again; the reason goes to the audit log (guide 9.2.3)
export class SetRiderActiveDto {
  @ApiProperty({ description: 'false switches the rider off' })
  @IsBoolean()
  isActive!: boolean;

  @ApiProperty({ minLength: 3, maxLength: 500 })
  @Trim()
  @IsString({ message: 'Give a reason' })
  @Length(3, 500, { message: 'The reason must be 3 to 500 characters' })
  reason!: string;
}
