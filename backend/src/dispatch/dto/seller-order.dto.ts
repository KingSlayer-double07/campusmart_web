import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { CursorQueryDto } from '../../common/pagination';
import { Trim } from '../../common/transforms';
import {
  DeliveryMethod,
  EscrowStatus,
  FulfillmentStatus,
} from '../../generated/prisma/enums';

export const SELLER_ORDER_TABS = [
  'TO_PREPARE',
  'ON_THE_WAY',
  'DONE',
  'PROBLEMS',
  'CANCELLED',
] as const;
export type SellerOrderTab = (typeof SELLER_ORDER_TABS)[number];

export class ListSellerOrdersQueryDto extends CursorQueryDto {
  @ApiPropertyOptional({
    enum: SELLER_ORDER_TABS,
    enumName: 'SellerOrderTab',
    default: 'TO_PREPARE',
    description:
      'TO_PREPARE: paid, not yet collected from you. ON_THE_WAY: with the rider. DONE: handed over. PROBLEMS: disputed. CANCELLED.',
  })
  @IsOptional()
  @IsIn(SELLER_ORDER_TABS)
  tab: SellerOrderTab = 'TO_PREPARE';
}

export class SellerOrderItemDto {
  @ApiProperty()
  title!: string;

  @ApiProperty({ type: String, nullable: true })
  variantLabel!: string | null;

  @ApiProperty({ type: String, nullable: true })
  imageUrl!: string | null;

  @ApiProperty()
  quantity!: number;

  @ApiProperty()
  unitPriceKobo!: number;
}

export class SellerOrderRiderDto {
  @ApiProperty({ description: 'The name only (DX8)' })
  name!: string;
}

// Guide 6.2, rebuilt for delivery: what the seller needs to prepare and hand over an order. Never
// the buyer's email, phone or address.
export class SellerSideOrderDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    example: 'CM-7F3K2Q',
    description: 'Give it to the rider when they collect (DX5)',
  })
  code!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  placedAt!: Date;

  @ApiProperty({ example: 'tobi', description: 'Username or first name' })
  buyerName!: string;

  @ApiProperty({
    enum: DeliveryMethod,
    enumName: 'DeliveryMethod',
    nullable: true,
  })
  deliveryMethod!: DeliveryMethod | null;

  @ApiProperty({ type: [SellerOrderItemDto] })
  items!: SellerOrderItemDto[];

  @ApiProperty()
  subtotalKobo!: number;

  @ApiProperty({
    description: 'What you are paid: the items less the platform fee',
  })
  sellerPayoutKobo!: number;

  @ApiProperty({ enum: FulfillmentStatus, enumName: 'FulfillmentStatus' })
  fulfillmentStatus!: FulfillmentStatus;

  @ApiProperty({ enum: EscrowStatus, enumName: 'EscrowStatus' })
  escrowStatus!: EscrowStatus;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'Dispatch: the rider must collect by then (DL7b). Pickup: the buyer must collect by then (DL7c).',
  })
  pickupDeadline!: Date | null;

  @ApiProperty({ type: SellerOrderRiderDto, nullable: true })
  rider!: SellerOrderRiderDto | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  arrivalFrom!: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  arrivalTo!: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  pickedUpAt!: Date | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'The rider found it not ready (DF11)',
  })
  notReadyAt!: Date | null;

  @ApiProperty({ type: String, nullable: true })
  notReadyNote!: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Handed over to the buyer',
  })
  handedOverAt!: Date | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'Your payout is released then, unless the buyer reports a problem',
  })
  releaseAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  cancelledAt!: Date | null;

  @ApiProperty({ type: String, nullable: true })
  cancelReason!: string | null;

  @ApiProperty({ description: 'You may cancel it (before it leaves you)' })
  canCancel!: boolean;

  @ApiProperty({
    description: '5 wrong buyer codes (F5); CampusMart unlocks it',
  })
  handoverLocked!: boolean;
}

export class SellerSideOrderPageDto {
  @ApiProperty({ type: [SellerSideOrderDto] })
  items!: SellerSideOrderDto[];

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  nextCursor!: string | null;
}

export class SellerOrderCountsDto {
  @ApiProperty()
  TO_PREPARE!: number;

  @ApiProperty()
  ON_THE_WAY!: number;

  @ApiProperty()
  DONE!: number;

  @ApiProperty()
  PROBLEMS!: number;

  @ApiProperty()
  CANCELLED!: number;
}

// Decision F10: a seller can cancel before the parcel leaves them; it counts against the store
export class CancelSellerOrderDto {
  @ApiProperty({ minLength: 3, maxLength: 300, example: 'Out of stock' })
  @Trim()
  @IsString()
  @Length(3, 300, { message: 'Say why, in 3 to 300 characters' })
  reason!: string;
}
