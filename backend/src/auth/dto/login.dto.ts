import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { NormalizeEmail } from './normalize-email';

export class LoginDto {
  @ApiProperty({ format: 'email', example: 'ada.obi@students.unilag.edu.ng' })
  @NormalizeEmail()
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: 'Campus2026' })
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  password!: string;

  @ApiPropertyOptional({
    example: '048213',
    description:
      'Admins only (M7): the 6-digit code emailed after the first try, sent again with the same email and password',
  })
  @IsOptional()
  @Matches(/^\d{6}$/, { message: 'The code is 6 digits' })
  code?: string;
}
