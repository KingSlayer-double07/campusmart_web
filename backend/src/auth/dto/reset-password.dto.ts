import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, Matches, MaxLength } from 'class-validator';
import { IsCampusMartPassword } from '../decorators/is-campusmart-password.decorator';
import { NormalizeEmail } from './normalize-email';

export class ResetPasswordDto {
  @ApiProperty({ format: 'email', example: 'ada.obi@students.unilag.edu.ng' })
  @NormalizeEmail()
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(254)
  email!: string;

  @ApiProperty({
    description: 'The 6-digit code from the email',
    example: '482913',
  })
  @Matches(/^\d{6}$/, { message: 'The code is 6 digits' })
  code!: string;

  @ApiProperty({ example: 'NewCampus2026' })
  @IsCampusMartPassword()
  newPassword!: string;
}
