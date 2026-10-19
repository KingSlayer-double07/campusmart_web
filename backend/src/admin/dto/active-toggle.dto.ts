import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Length,
  ValidateIf,
} from 'class-validator';
import { CursorQueryDto } from '../../common/pagination';
import { Trim } from '../../common/transforms';

export const ACTIVE_FILTERS = ['ACTIVE', 'INACTIVE'] as const;
export type ActiveFilter = (typeof ACTIVE_FILTERS)[number];

// Switching a record off is destructive, so it needs a reason; the reason goes to the audit log
// (guide 9.2.3: every destructive action goes through a confirm dialog that requires a reason).
export class ActiveToggleDto {
  @ApiPropertyOptional({
    description: 'false switches it off (needs a reason)',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    minLength: 3,
    maxLength: 500,
    description: 'Required when isActive is false. Kept in the audit log.',
  })
  @ValidateIf(
    (dto: ActiveToggleDto) =>
      dto.isActive === false || dto.reason !== undefined,
  )
  @Trim()
  @IsString({ message: 'Give a reason for switching it off' })
  @Length(3, 500, { message: 'The reason must be 3 to 500 characters' })
  reason?: string;
}

export class AdminListQueryDto extends CursorQueryDto {
  @ApiPropertyOptional({ maxLength: 100, description: 'Search text' })
  @IsOptional()
  @Trim()
  @IsString()
  @Length(0, 100)
  q?: string;

  @ApiPropertyOptional({ enum: ACTIVE_FILTERS, enumName: 'ActiveFilter' })
  @IsOptional()
  @IsIn(ACTIVE_FILTERS)
  status?: ActiveFilter;
}

export const activeWhere = (status?: ActiveFilter) =>
  status ? { isActive: status === 'ACTIVE' } : {};
