import { ApiProperty } from '@nestjs/swagger';
import {
  ListingCategory,
  ListingStatus,
  ProductCondition,
} from '../../generated/prisma/enums';

export class ListingCardSellerDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    description: 'Store name, else username, else first name. Never an email.',
  })
  displayName!: string;

  @ApiProperty({ description: 'Seller ID check approved (Phase 9)' })
  verified!: boolean;
}

export class ListingCardDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ description: 'Listing price in kobo' })
  priceKobo!: number;

  @ApiProperty({
    description: 'Lowest price a buyer can pay, across active options',
  })
  minPriceKobo!: number;

  @ApiProperty({
    description: 'Highest price a buyer can pay, across active options',
  })
  maxPriceKobo!: number;

  @ApiProperty({ type: String, nullable: true, description: 'First photo' })
  imageUrl!: string | null;

  @ApiProperty({ enum: ListingCategory, enumName: 'ListingCategory' })
  category!: ListingCategory;

  @ApiProperty({ enum: ProductCondition, enumName: 'ProductCondition' })
  condition!: ProductCondition;

  @ApiProperty({ enum: ListingStatus, enumName: 'ListingStatus' })
  status!: ListingStatus;

  @ApiProperty({
    description: 'Units left; the sum of active options when it has options',
  })
  stock!: number;

  @ApiProperty()
  ratingAvg!: number;

  @ApiProperty()
  ratingCount!: number;

  @ApiProperty()
  hasVariants!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: ListingCardSellerDto })
  seller!: ListingCardSellerDto;
}

export class ListingPageDto {
  @ApiProperty({ type: [ListingCardDto] })
  items!: ListingCardDto[];

  @ApiProperty({ type: String, nullable: true })
  nextCursor!: string | null;
}

export class ListingImageDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  url!: string;

  @ApiProperty()
  publicId!: string;

  @ApiProperty({ description: '0 is the cover photo' })
  position!: number;
}

export class ListingVariantDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'M' })
  label!: string;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'null = the listing price',
  })
  priceKobo!: number | null;

  @ApiProperty()
  stock!: number;

  @ApiProperty()
  isActive!: boolean;
}

export class ListingSellerDto extends ListingCardSellerDto {
  @ApiProperty({ type: String, nullable: true })
  storeName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  logoUrl!: string | null;

  @ApiProperty()
  ratingAvg!: number;

  @ApiProperty()
  ratingCount!: number;

  @ApiProperty()
  isOnline!: boolean;
}

export class ListingDto extends ListingCardDto {
  @ApiProperty()
  description!: string;

  @ApiProperty({ type: [ListingImageDto] })
  images!: ListingImageDto[];

  @ApiProperty({
    type: [ListingVariantDto],
    description: 'Buyers see active options only; the owner sees all',
  })
  variants!: ListingVariantDto[];

  @ApiProperty({ type: ListingSellerDto })
  declare seller: ListingSellerDto;

  @ApiProperty({ description: 'True when the signed-in user is the seller' })
  isOwner!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}
