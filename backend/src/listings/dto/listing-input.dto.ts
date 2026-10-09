import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Trim } from '../../common/transforms';
import {
  ListingCategory,
  ProductCondition,
} from '../../generated/prisma/enums';

export const MIN_PRICE_KOBO = 100; // ₦1
export const MAX_PRICE_KOBO = 1_000_000_000; // ₦10m, well inside a 32-bit integer
export const MAX_STOCK = 100_000;

export class ListingImageInputDto {
  @ApiProperty({
    example:
      'https://res.cloudinary.com/campusmart/image/upload/v1/campusmart/listings/<userId>/abc.jpg',
  })
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(500)
  url!: string;

  @ApiProperty({ example: 'campusmart/listings/<userId>/abc' })
  @IsString()
  @Length(1, 300)
  publicId!: string;
}

export class ListingVariantInputDto {
  @ApiProperty({ example: 'Black / XL', minLength: 1, maxLength: 40 })
  @Trim()
  @IsString()
  @Length(1, 40, { message: 'Each option needs a name of up to 40 characters' })
  label!: string;

  @ApiPropertyOptional({
    minimum: MIN_PRICE_KOBO,
    description: 'Leave out to use the listing price',
  })
  @IsOptional()
  @IsInt()
  @Min(MIN_PRICE_KOBO, { message: 'An option price must be at least ₦1' })
  @Max(MAX_PRICE_KOBO)
  priceKobo?: number;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  @Max(MAX_STOCK)
  stock!: number;
}

// Guide 3.1 CreateListingDto
export class CreateListingDto {
  @ApiProperty({
    minLength: 3,
    maxLength: 120,
    example: 'UrbanFlex cargo pants',
  })
  @Trim()
  @IsString()
  @Length(3, 120, { message: 'The title must be 3 to 120 characters' })
  title!: string;

  @ApiProperty({ maxLength: 2000 })
  @Trim()
  @IsString()
  @MaxLength(2000, { message: 'The description can be up to 2,000 characters' })
  description!: string;

  @ApiProperty({
    minimum: MIN_PRICE_KOBO,
    description: 'In kobo (D3); ₦1 = 100',
  })
  @IsInt({ message: 'priceKobo must be a whole number of kobo' })
  @Min(MIN_PRICE_KOBO, { message: 'The price must be at least ₦1' })
  @Max(MAX_PRICE_KOBO)
  priceKobo!: number;

  @ApiPropertyOptional({
    minimum: 0,
    description: 'Required without variants; ignored when variants are sent',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_STOCK)
  stock?: number;

  @ApiProperty({ enum: ListingCategory, enumName: 'ListingCategory' })
  @IsEnum(ListingCategory)
  category!: ListingCategory;

  @ApiProperty({ enum: ProductCondition, enumName: 'ProductCondition' })
  @IsEnum(ProductCondition)
  condition!: ProductCondition;

  @ApiProperty({ type: [ListingImageInputDto], minItems: 1, maxItems: 8 })
  @IsArray()
  @ArrayMinSize(1, { message: 'Add at least one photo' })
  @ArrayMaxSize(8, { message: 'Add up to 8 photos' })
  @ValidateNested({ each: true })
  @Type(() => ListingImageInputDto)
  images!: ListingImageInputDto[];

  @ApiPropertyOptional({ type: [ListingVariantInputDto], maxItems: 20 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20, { message: 'Add up to 20 options' })
  @ValidateNested({ each: true })
  @Type(() => ListingVariantInputDto)
  variants?: ListingVariantInputDto[];

  @ApiProperty({ enum: ['DRAFT', 'ACTIVE'] })
  @IsIn(['DRAFT', 'ACTIVE'], { message: 'status must be DRAFT or ACTIVE' })
  status!: 'DRAFT' | 'ACTIVE';
}

// Partial update. images and variants, when sent, replace the whole set (guide 3.1).
// Status changes go through PATCH /listings/:id/status.
export class UpdateListingDto extends PartialType(
  OmitType(CreateListingDto, ['status'] as const),
) {}

export const OWNER_STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const;
export type OwnerStatus = (typeof OWNER_STATUSES)[number];

export class ListingStatusDto {
  @ApiProperty({ enum: OWNER_STATUSES })
  @IsIn(OWNER_STATUSES, { message: 'status must be DRAFT, ACTIVE or ARCHIVED' })
  status!: OwnerStatus;
}
