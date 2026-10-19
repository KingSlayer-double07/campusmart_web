import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, MaxLength } from 'class-validator';
import { NormalizeEmail } from './normalize-email';

export class ForgotPasswordDto {
  @ApiProperty({ format: 'email', example: 'ada.obi@students.unilag.edu.ng' })
  @NormalizeEmail()
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(254)
  email!: string;
}
