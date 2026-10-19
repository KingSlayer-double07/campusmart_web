import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

export class VerifyEmailDto {
  @ApiProperty({
    description: 'The 6-digit code from the email',
    example: '482913',
  })
  @Matches(/^\d{6}$/, { message: 'The code is 6 digits' })
  code!: string;
}
