import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CursorQueryDto } from '../../common/pagination';
import { Trim } from '../../common/transforms';
import { COMMENT_MAX } from '../review-rules';

export class CreateReviewDto {
  @ApiProperty({ format: 'uuid', description: 'An item in this store order' })
  @IsUUID()
  listingId!: string;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1, { message: 'Choose 1 to 5 stars' })
  @Max(5, { message: 'Choose 1 to 5 stars' })
  rating!: number;

  @ApiPropertyOptional({ maxLength: COMMENT_MAX })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(COMMENT_MAX, {
    message: `Keep it to ${COMMENT_MAX} characters`,
  })
  comment?: string;
}

export class ReviewDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ minimum: 1, maximum: 5 })
  rating!: number;

  @ApiProperty({ type: String, nullable: true })
  comment!: string | null;

  @ApiProperty({
    description: 'The buyer’s username or first name; never their email',
  })
  reviewerDisplayName!: string;

  @ApiProperty({ description: 'The item reviewed' })
  listingTitle!: string;

  @ApiProperty()
  createdAt!: Date;
}

export class ReviewPageDto {
  @ApiProperty({ type: [ReviewDto] })
  items!: ReviewDto[];

  @ApiProperty({ type: String, nullable: true })
  nextCursor!: string | null;
}

// GET /listings/:id/reviews: a guest says which school they're browsing (decision 2026-10-19)
export class ListingReviewsQueryDto extends CursorQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Guests only: the school they picked to browse. Ignored when signed in.',
  })
  @IsOptional()
  @IsUUID()
  institutionId?: string;
}

export class AdminReviewsQueryDto extends CursorQueryDto {
  @ApiPropertyOptional({
    enum: ['SHOWN', 'HIDDEN'],
    default: 'SHOWN',
    description: 'Reviews buyers see, or ones an admin hid',
  })
  @IsOptional()
  @IsIn(['SHOWN', 'HIDDEN'])
  view: 'SHOWN' | 'HIDDEN' = 'SHOWN';
}

export class AdminReviewDto extends ReviewDto {
  @ApiProperty({ format: 'uuid' })
  listingId!: string;

  @ApiProperty({ format: 'uuid' })
  sellerId!: string;

  @ApiProperty()
  storeName!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  hiddenAt!: Date | null;

  @ApiProperty({ type: String, nullable: true })
  hiddenReason!: string | null;
}

export class AdminReviewPageDto {
  @ApiProperty({ type: [AdminReviewDto] })
  items!: AdminReviewDto[];

  @ApiProperty({ type: String, nullable: true })
  nextCursor!: string | null;
}

export class HideReviewDto {
  @ApiProperty({
    minLength: 3,
    maxLength: 500,
    description: 'Why it’s hidden; kept in the audit log',
  })
  @Trim()
  @IsString()
  @Length(3, 500, { message: 'The reason must be 3 to 500 characters' })
  reason!: string;
}
