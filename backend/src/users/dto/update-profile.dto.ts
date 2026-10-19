import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { PHONE_MESSAGE, PHONE_RE } from '../../common/phone';
import { Trim } from '../../common/transforms';

// Empty text clears an optional field
const blankToNull = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() === '' ? null : value,
  );

// Guide 10: the email is the identity, so it isn't editable; a buyer's school changes on its own
// screen (G1), and a seller's comes from their school email
export class UpdateProfileDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'ada_obi',
    description:
      '3–20 lower-case letters, digits or _; unique (409 USERNAME_TAKEN)',
  })
  @IsOptional()
  @blankToNull()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @Matches(/^[a-z0-9_]{3,20}$/, {
    message: 'Use 3 to 20 lower-case letters, numbers or _',
  })
  username?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Ada' })
  @IsOptional()
  @blankToNull()
  @Trim()
  @IsString({ message: 'First name must be text' })
  @MaxLength(50)
  firstName?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Obi' })
  @IsOptional()
  @blankToNull()
  @Trim()
  @IsString({ message: 'Last name must be text' })
  @MaxLength(50)
  lastName?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '+234 801 234 5678',
  })
  @IsOptional()
  @blankToNull()
  @Trim()
  @Matches(PHONE_RE, { message: PHONE_MESSAGE })
  phone?: string | null;
}
