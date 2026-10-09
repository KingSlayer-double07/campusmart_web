import { ApiProperty, IntersectionType, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsString,
  Length,
  Matches,
} from 'class-validator';
import { Trim } from '../../common/transforms';
import { ActiveToggleDto } from './active-toggle.dto';

export const DOMAIN_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

// ' @Students.UNILAG.edu.ng ' -> 'students.unilag.edu.ng'
const NormalizeDomains = () =>
  Transform(({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? value.map((d: unknown) =>
          typeof d === 'string' ? d.trim().toLowerCase().replace(/^@/, '') : d,
        )
      : value,
  );

export class CreateInstitutionDto {
  @ApiProperty({ minLength: 2, maxLength: 120, example: 'University of Lagos' })
  @Trim()
  @IsString()
  @Length(2, 120, { message: 'The name must be 2 to 120 characters' })
  name!: string;

  @ApiProperty({
    type: [String],
    minItems: 1,
    maxItems: 20,
    example: ['unilag.edu.ng'],
    description:
      'Email domains students sign up with. Sub-domains match too (students.unilag.edu.ng matches unilag.edu.ng).',
  })
  @NormalizeDomains()
  @IsArray()
  @ArrayMinSize(1, { message: 'Add at least one email domain' })
  @ArrayMaxSize(20)
  @ArrayUnique({ message: 'Each domain can only be listed once' })
  @Matches(DOMAIN_RE, {
    each: true,
    message: 'Each domain must look like unilag.edu.ng',
  })
  domains!: string[];
}

export class UpdateInstitutionDto extends IntersectionType(
  PartialType(CreateInstitutionDto),
  ActiveToggleDto,
) {}

export class AdminInstitutionDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'University of Lagos' })
  name!: string;

  @ApiProperty({ type: [String], example: ['unilag.edu.ng'] })
  domains!: string[];

  @ApiProperty({
    description:
      'When false: sign-ups are blocked, it is hidden from the public list, and only admins can sign in',
  })
  isActive!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ description: 'Pickup stations, active or not' })
  stationCount!: number;

  @ApiProperty({ description: 'Accounts that belong to this institution' })
  userCount!: number;
}

export class AdminInstitutionPageDto {
  @ApiProperty({ type: [AdminInstitutionDto] })
  items!: AdminInstitutionDto[];

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  nextCursor!: string | null;
}
