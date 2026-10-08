import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { IsCampusMartPassword } from '../../auth/decorators/is-campusmart-password.decorator';

export class ChangePasswordDto {
  @ApiProperty({ description: 'Current password of the account' })
  @IsString({ message: 'Current password must be a string' })
  @IsNotEmpty({ message: 'Current password is required' })
  currentPassword!: string;

  @ApiProperty({
    example: 'NewCampus2026',
    description:
      '8+ characters with an uppercase letter, a lowercase letter and a number',
  })
  @IsCampusMartPassword()
  newPassword!: string;
}
