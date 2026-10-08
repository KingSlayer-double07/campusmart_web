import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, MaxLength } from 'class-validator';
import { IsCampusMartPassword } from '../decorators/is-campusmart-password.decorator';
import { NormalizeEmail } from './normalize-email';

export const ACCOUNT_TYPES = ['BUYER', 'SELLER'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

// D7: school email and password are the only required fields; the institution comes from the domain
export class RegisterDto {
  @ApiProperty({ format: 'email', example: 'ada.obi@students.unilag.edu.ng' })
  @NormalizeEmail()
  @IsEmail({}, { message: 'Enter a valid school email address' })
  @MaxLength(254)
  email!: string;

  @ApiProperty({
    example: 'Campus2026',
    description:
      '8+ characters with an uppercase letter, a lowercase letter and a number',
  })
  @IsCampusMartPassword()
  password!: string;

  @ApiProperty({ enum: ACCOUNT_TYPES, enumName: 'AccountType' })
  @IsIn(ACCOUNT_TYPES, { message: 'accountType must be BUYER or SELLER' })
  accountType!: AccountType;
}
