import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';
import { IsCampusMartPassword } from '../decorators/is-campusmart-password.decorator';

// Decision DX1: a rider sets their password from the invite link
export class AcceptInviteDto {
  @ApiProperty({ description: 'The token from the invite link' })
  @IsString()
  @Length(20, 100, { message: 'This invite link is incomplete' })
  token!: string;

  @ApiProperty({
    example: 'Campus2026',
    description:
      '8+ characters with an uppercase letter, a lowercase letter and a number',
  })
  @IsCampusMartPassword()
  password!: string;
}
