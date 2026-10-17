import {
  ApiProperty,
  ApiPropertyOptional,
  IntersectionType,
  PartialType,
} from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
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

// ₦100,000: far above any campus delivery, so a typo with extra zeros is caught
export const MAX_DELIVERY_FEE_KOBO = 10_000_000;

export class UpdateInstitutionDto extends IntersectionType(
  PartialType(CreateInstitutionDto),
  ActiveToggleDto,
) {
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 0,
    maximum: MAX_DELIVERY_FEE_KOBO,
    example: 50_000,
    description:
      'The flat fee for dispatch to a campus place, in kobo, charged once per order. null stops on-campus dispatch at this school.',
  })
  @IsOptional()
  @ValidateIf((dto: UpdateInstitutionDto) => dto.deliveryFeeKobo !== null)
  @IsInt({ message: 'The delivery fee must be a whole number of kobo' })
  @Min(0)
  @Max(MAX_DELIVERY_FEE_KOBO, {
    message: 'The delivery fee can be up to ₦100,000',
  })
  deliveryFeeKobo?: number | null;
}

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

  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'Flat on-campus delivery fee in kobo, once per order. null: on-campus dispatch is not offered yet.',
  })
  deliveryFeeKobo!: number | null;

  @ApiProperty({ description: 'Pickup stations, active or not' })
  stationCount!: number;

  @ApiProperty({ description: 'Campus places, active or not' })
  placeCount!: number;

  @ApiProperty({ description: 'Accounts that belong to this institution' })
  userCount!: number;
}

export class AdminInstitutionPageDto {
  @ApiProperty({ type: [AdminInstitutionDto] })
  items!: AdminInstitutionDto[];

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  nextCursor!: string | null;
}
