import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { METRICS, RANGES } from '../analytics-rules';
import type { Metric, Range } from '../analytics-rules';

const RANGE_DESCRIPTION =
  'The last 7, 30 or 90 days in Lagos time, today included. Changes compare with the same number of days before.';

const ORDERS_DEFINITION =
  'Your store orders whose order is PAID, placed in the range, not cancelled';

export class RangeQueryDto {
  @ApiPropertyOptional({
    enum: RANGES,
    enumName: 'AnalyticsRange',
    default: '7d',
    description: RANGE_DESCRIPTION,
  })
  @IsOptional()
  @IsIn(RANGES, { message: 'Choose 7d, 30d or 90d' })
  range: Range = '7d';
}

export class TimeseriesQueryDto extends RangeQueryDto {
  @ApiPropertyOptional({
    enum: METRICS,
    enumName: 'AnalyticsMetric',
    default: 'revenue',
  })
  @IsOptional()
  @IsIn(METRICS, { message: 'Choose revenue, orders or views' })
  metric: Metric = 'revenue';
}

export class TopListingsQueryDto extends RangeQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 20, default: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit: number = 5;
}

export class SellerStatsDto {
  @ApiProperty({ enum: RANGES, enumName: 'AnalyticsRange' })
  range!: Range;

  @ApiProperty({
    description:
      'Views of your listings: one per viewer per listing per day; your own views don’t count (A2)',
  })
  views!: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Change against the previous range, in %; null when it was 0',
  })
  viewsChangePct!: number | null;

  @ApiProperty({ description: ORDERS_DEFINITION })
  orders!: number;

  @ApiProperty({ type: Number, nullable: true })
  ordersChangePct!: number | null;

  @ApiProperty({
    description:
      'The item subtotals of those orders, in kobo. Delivery fees aren’t yours, so they’re left out.',
  })
  revenueKobo!: number;

  @ApiProperty({ type: Number, nullable: true })
  revenueChangePct!: number | null;

  @ApiProperty({
    description:
      'Held for you now: your payout on store orders whose escrow is HELD, in kobo. Not limited to the range.',
  })
  heldKobo!: number;

  @ApiProperty({
    description:
      'Released but not in your bank yet: payouts waiting for your account, being sent or to be retried, in kobo. Not limited to the range.',
  })
  releasedKobo!: number;

  @ApiProperty({
    description: 'Payouts PAID to your bank in the range, in kobo',
  })
  paidOutKobo!: number;
}

export class TimeseriesPointDto {
  @ApiProperty({ example: '2026-10-17', description: 'A Lagos day' })
  date!: string;

  @ApiProperty({
    description:
      'Revenue in kobo, orders, or views that day; 0 when there were none',
  })
  value!: number;
}

export class TopListingDto {
  @ApiProperty({ format: 'uuid' })
  listingId!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ type: String, nullable: true })
  imageUrl!: string | null;

  @ApiProperty({ description: 'Units in counted orders in the range' })
  unitsSold!: number;

  @ApiProperty({ description: 'Their item subtotal, in kobo' })
  revenueKobo!: number;

  @ApiProperty({ description: 'Views in the range' })
  views!: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Units sold per view, in %; null with no views',
  })
  conversionPct!: number | null;
}

export class InventoryAlertDto {
  @ApiProperty({ format: 'uuid' })
  listingId!: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'The option running low, for an item with options',
  })
  variantId!: string | null;

  @ApiProperty()
  title!: string;

  @ApiProperty({ type: String, nullable: true })
  variantLabel!: string | null;

  @ApiProperty({ type: String, nullable: true })
  imageUrl!: string | null;

  @ApiProperty({ description: 'Units left; 0 is out of stock' })
  stock!: number;
}

export class InventoryAlertsDto {
  @ApiProperty({
    description:
      'Items with this many left or fewer are listed (A1; admins can change it)',
  })
  threshold!: number;

  @ApiProperty({
    type: [InventoryAlertDto],
    description:
      'Live and sold-out listings, or their options, at or below the threshold. Out of stock first.',
  })
  items!: InventoryAlertDto[];
}
