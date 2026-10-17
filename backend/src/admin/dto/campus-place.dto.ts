import {
  ApiProperty,
  ApiPropertyOptional,
  IntersectionType,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { Trim } from '../../common/transforms';
import { ActiveToggleDto, AdminListQueryDto } from './active-toggle.dto';
import { StationInstitutionDto } from './pickup-station.dto';

export class CreateCampusPlaceDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: 'Choose an institution' })
  institutionId!: string;

  @ApiProperty({ minLength: 2, maxLength: 80, example: 'Moremi Hall' })
  @Trim()
  @IsString()
  @Length(2, 80, { message: 'The name must be 2 to 80 characters' })
  name!: string;
}

// The institution can't change: orders keep the place they were delivered to
export class UpdateCampusPlaceDto extends IntersectionType(
  PartialType(OmitType(CreateCampusPlaceDto, ['institutionId'] as const)),
  ActiveToggleDto,
) {}

export class ListCampusPlacesQueryDto extends AdminListQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  institutionId?: string;
}

export class AdminCampusPlaceDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Moremi Hall' })
  name!: string;

  @ApiProperty({ description: 'Only active places are offered at checkout' })
  isActive!: boolean;

  @ApiProperty({ type: StationInstitutionDto })
  institution!: StationInstitutionDto;

  @ApiProperty({ description: 'Orders delivered to this place' })
  orderCount!: number;
}

export class AdminCampusPlacePageDto {
  @ApiProperty({ type: [AdminCampusPlaceDto] })
  items!: AdminCampusPlaceDto[];

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  nextCursor!: string | null;
}
