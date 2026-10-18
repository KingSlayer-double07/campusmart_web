import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsUUID, Matches, MaxLength } from 'class-validator';
import { NormalizeEmail } from '../../auth/dto/normalize-email';

export class SetInstitutionDto {
  @ApiProperty({
    format: 'uuid',
    description: 'An active school from GET /institutions',
  })
  @IsUUID('all', { message: 'Choose your school' })
  institutionId!: string;
}

export class SchoolEmailDto {
  @ApiProperty({ format: 'email', example: 'ada.obi@students.unilag.edu.ng' })
  @NormalizeEmail()
  @IsEmail({}, { message: 'Enter your school email address' })
  @MaxLength(254)
  email!: string;
}

export class SchoolEmailCodeDto {
  @ApiProperty({
    example: '048213',
    description: 'The 6-digit code sent to the school email',
  })
  @Matches(/^\d{6}$/, { message: 'The code is 6 digits' })
  code!: string;
}
