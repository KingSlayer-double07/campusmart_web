import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator';
import { ListingCardDto } from '../../listings/dto/listing.dto';

export const MERGE_LIMIT = 100;

export class WishlistItemDto extends ListingCardDto {
  @ApiProperty({
    description:
      'False when the listing is sold out, paused or removed; it stays in the list until taken out',
  })
  available!: boolean;

  @ApiProperty({ description: 'When it was saved' })
  savedAt!: Date;
}

export class WishlistPageDto {
  @ApiProperty({ type: [WishlistItemDto] })
  items!: WishlistItemDto[];

  @ApiProperty({ type: String, nullable: true })
  nextCursor!: string | null;
}

export class WishlistIdsDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    description: 'Every saved listing, to show the hearts',
  })
  listingIds!: string[];
}

export class MergeWishlistDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    maxItems: MERGE_LIMIT,
    description:
      'Favourites saved on this phone before sign-in (decision R5). Ones the user can’t see are skipped.',
  })
  @IsArray()
  @ArrayMaxSize(MERGE_LIMIT)
  @IsUUID('all', { each: true })
  listingIds!: string[];
}
