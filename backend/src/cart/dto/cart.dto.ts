import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ListingCardDto } from '../../listings/dto/listing.dto';
import {
  MAX_CART_LINES,
  MAX_LINE_QUANTITY,
  type CartIssueType,
} from '../cart-rules';

export class SetCartItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  listingId!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Required when the listing has options',
  })
  @IsOptional()
  @IsUUID()
  variantId?: string;

  @ApiProperty({
    minimum: 0,
    maximum: MAX_LINE_QUANTITY,
    description: 'The absolute quantity; 0 removes the line',
  })
  @IsInt()
  @Min(0)
  @Max(MAX_LINE_QUANTITY)
  quantity!: number;
}

export class MergeCartLineDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  listingId!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  variantId?: string;

  @ApiProperty({ minimum: 1, maximum: MAX_LINE_QUANTITY })
  @IsInt()
  @Min(1)
  @Max(MAX_LINE_QUANTITY)
  quantity!: number;
}

export class MergeCartDto {
  @ApiProperty({
    type: [MergeCartLineDto],
    maxItems: MAX_CART_LINES,
    description: 'The guest cart from this device. Prices are never sent.',
  })
  @IsArray()
  @ArrayMaxSize(MAX_CART_LINES)
  @ValidateNested({ each: true })
  @Type(() => MergeCartLineDto)
  items!: MergeCartLineDto[];
}

export class CartVariantDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  label!: string;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: "null = the listing's price",
  })
  priceKobo!: number | null;

  @ApiProperty()
  stock!: number;
}

export class CartItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: ListingCardDto })
  listing!: ListingCardDto;

  @ApiProperty({ type: CartVariantDto, nullable: true })
  variant!: CartVariantDto | null;

  @ApiProperty()
  quantity!: number;

  @ApiProperty({ description: 'Current price of one unit, in kobo' })
  unitPriceKobo!: number;

  @ApiProperty({
    description: 'Can be bought now (live, at your school, in stock)',
  })
  available!: boolean;

  @ApiProperty({
    description: 'Most this line can hold right now (0 when unavailable)',
  })
  maxQuantity!: number;
}

export class CartSellerDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    description: 'Store name, else username, else first name',
  })
  storeName!: string;
}

export class CartGroupDto {
  @ApiProperty({ type: CartSellerDto })
  seller!: CartSellerDto;

  @ApiProperty({ type: [CartItemDto] })
  items!: CartItemDto[];

  @ApiProperty({ description: 'Available lines only, in kobo' })
  subtotalKobo!: number;
}

export const CART_ISSUE_TYPES = [
  'UNAVAILABLE',
  'OUT_OF_STOCK',
  'LOW_STOCK',
  'PRICE_CHANGED',
] as const satisfies readonly CartIssueType[];

export class CartIssueDto {
  @ApiProperty({ format: 'uuid' })
  itemId!: string;

  @ApiProperty({ format: 'uuid' })
  listingId!: string;

  @ApiProperty({ enum: CART_ISSUE_TYPES, enumName: 'CartIssueType' })
  type!: CartIssueType;

  @ApiProperty({ example: 'Only 2 left' })
  message!: string;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Units left (OUT_OF_STOCK, LOW_STOCK)',
  })
  available!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  previousPriceKobo!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  currentPriceKobo!: number | null;
}

export class CartDto {
  @ApiProperty({ type: [CartGroupDto], description: 'One group per seller' })
  groups!: CartGroupDto[];

  @ApiProperty({ description: 'Available lines only, in kobo' })
  subtotalKobo!: number;

  @ApiProperty({ description: 'Units across all lines' })
  itemCount!: number;

  @ApiProperty({ type: [CartIssueDto] })
  issues!: CartIssueDto[];
}
