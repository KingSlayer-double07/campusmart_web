import {
  ApiProperty,
  ApiPropertyOptional,
  IntersectionType,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Trim } from '../../common/transforms';
import { ActiveToggleDto, AdminListQueryDto } from './active-toggle.dto';
import { IsOpeningHours, OpeningHoursDto } from './opening-hours.dto';

const PHONE_RE = /^\+?\d[\d ()-]{6,19}$/;

export class CreatePickupStationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: 'Choose an institution' })
  institutionId!: string;

  @ApiProperty({
    minLength: 2,
    maxLength: 120,
    example: 'Main Gate Pickup Point',
  })
  @Trim()
  @IsString()
  @Length(2, 120, { message: 'The name must be 2 to 120 characters' })
  name!: string;

  @ApiProperty({
    minLength: 5,
    maxLength: 300,
    example: 'Main Gate, University Road',
  })
  @Trim()
  @IsString()
  @Length(5, 300, { message: 'The address must be 5 to 300 characters' })
  address!: string;

  @ApiProperty({ minLength: 2, maxLength: 120, example: 'Bola Ade' })
  @Trim()
  @IsString()
  @Length(2, 120, { message: 'The contact name must be 2 to 120 characters' })
  contactName!: string;

  @ApiProperty({ example: '+234 801 234 5678' })
  @Trim()
  @IsString()
  @Matches(PHONE_RE, {
    message: 'Enter a phone number such as +234 801 234 5678',
  })
  contactPhone!: string;

  @ApiProperty({
    type: [OpeningHoursDto],
    minItems: 1,
    maxItems: 7,
    description: 'One entry per open day; days not listed are closed',
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'Open the station on at least one day' })
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => OpeningHoursDto)
  @IsOpeningHours()
  openingHours!: OpeningHoursDto[];
}

// The institution can't change: orders and agents are tied to the station's campus
export class UpdatePickupStationDto extends IntersectionType(
  PartialType(OmitType(CreatePickupStationDto, ['institutionId'] as const)),
  ActiveToggleDto,
) {}

export class ListPickupStationsQueryDto extends AdminListQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  institutionId?: string;
}

export class StationInstitutionDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  isActive!: boolean;
}

export class AdminPickupStationDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  address!: string;

  @ApiProperty()
  contactName!: string;

  @ApiProperty()
  contactPhone!: string;

  @ApiProperty({ type: [OpeningHoursDto] })
  openingHours!: OpeningHoursDto[];

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ type: StationInstitutionDto })
  institution!: StationInstitutionDto;

  @ApiProperty({ description: 'Pickup agents assigned to this station' })
  agentCount!: number;
}

export class AdminPickupStationPageDto {
  @ApiProperty({ type: [AdminPickupStationDto] })
  items!: AdminPickupStationDto[];

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  nextCursor!: string | null;
}
