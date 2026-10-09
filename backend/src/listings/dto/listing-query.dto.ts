import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Trim } from '../../common/transforms';
import {
  ListingCategory,
  ListingStatus,
  ProductCondition,
} from '../../generated/prisma/enums';
import { LISTING_SORTS, type ListingSort } from '../listing-cursor';

class PageQueryDto {
  @ApiPropertyOptional({ description: 'nextCursor from the previous page' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 20;
}

// GET /listings (guide 3.1)
export class ListListingsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @Trim()
  @IsString()
  @Length(0, 100)
  q?: string;

  @ApiPropertyOptional({ enum: ListingCategory, enumName: 'ListingCategory' })
  @IsOptional()
  @IsEnum(ListingCategory)
  category?: ListingCategory;

  @ApiPropertyOptional({ enum: ProductCondition, enumName: 'ProductCondition' })
  @IsOptional()
  @IsEnum(ProductCondition)
  condition?: ProductCondition;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minPriceKobo?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxPriceKobo?: number;

  @ApiPropertyOptional({
    enum: LISTING_SORTS,
    enumName: 'ListingSort',
    default: 'newest',
    description:
      'popular = most viewed in the last 7 days, first 200 results only',
  })
  @IsOptional()
  @IsIn(LISTING_SORTS)
  sort: ListingSort = 'newest';
}

// GET /sellers/me/listings: every status, drafts included
export class SellerListingsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: ListingStatus, enumName: 'ListingStatus' })
  @IsOptional()
  @IsEnum(ListingStatus)
  status?: ListingStatus;
}
