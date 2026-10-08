import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

// The school email is the identity (D7) and the institution comes from it (D9), so neither is
// editable here. Username and phone arrive with the Phase 10 profile work.
export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Ada' })
  @IsString({ message: 'First name must be a string' })
  @MaxLength(50)
  @IsOptional()
  firstName?: string;

  @ApiPropertyOptional({ example: 'Obi' })
  @IsString({ message: 'Last name must be a string' })
  @MaxLength(50)
  @IsOptional()
  lastName?: string;
}
