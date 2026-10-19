import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, MaxLength } from 'class-validator';
import { IsCampusMartPassword } from '../decorators/is-campusmart-password.decorator';
import { NormalizeEmail } from './normalize-email';

export const ACCOUNT_TYPES = ['BUYER', 'SELLER'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

// D7: email and password are the only fields. A school email finds the institution from its domain;
// sellers need one, buyers may use any email and pick their school afterwards (decision T1).
export class RegisterDto {
  @ApiProperty({
    format: 'email',
    example: 'ada.obi@students.unilag.edu.ng',
    description: 'A school email for a seller; any email for a buyer',
  })
  @NormalizeEmail()
  @IsEmail({}, { message: 'Enter a valid email address' })
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
