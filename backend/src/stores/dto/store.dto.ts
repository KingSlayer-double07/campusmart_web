import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class StoresQueryDto {
  @ApiPropertyOptional({
    description:
      'The home page row: the first `limit` stores only, with no next page',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  featured?: boolean;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 20;

  @ApiPropertyOptional({ description: 'nextCursor from the previous page' })
  @IsOptional()
  @Matches(/^\d{1,6}$/, { message: 'cursor is not valid' })
  cursor?: string;
}

export class StoreCardDto {
  @ApiProperty({ format: 'uuid' })
  sellerId!: string;

  @ApiProperty({ description: 'The store name, else the seller’s name' })
  storeName!: string;

  @ApiProperty({ type: String, nullable: true })
  logoUrl!: string | null;

  @ApiProperty()
  ratingAvg!: number;

  @ApiProperty()
  ratingCount!: number;

  @ApiProperty({ description: 'CampusMart checked their student ID' })
  verified!: boolean;

  @ApiProperty({
    description:
      'A trust score of 80 or more (R2); the score itself isn’t shown',
  })
  trusted!: boolean;

  @ApiProperty({ description: 'Live listings' })
  listingCount!: number;
}

export class StorePageDto {
  @ApiProperty({ type: [StoreCardDto] })
  items!: StoreCardDto[];

  @ApiProperty({ type: String, nullable: true })
  nextCursor!: string | null;
}

export class StoreDto extends StoreCardDto {
  @ApiProperty({ type: String, nullable: true })
  bio!: string | null;

  @ApiProperty()
  isOnline!: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Where the store is, when buyers can pick up from it (SA2); the full address only after paying',
  })
  pickupArea!: string | null;

  @ApiProperty({ description: 'On CampusMart since' })
  joinedAt!: Date;
}
