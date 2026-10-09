import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsUUID } from 'class-validator';
import { OpeningHoursDto } from '../../admin/dto/opening-hours.dto';
import {
  FulfillmentStatus,
  OrderStatus,
  PaymentMethod,
} from '../../generated/prisma/enums';

export class CheckoutDto {
  @ApiProperty({
    format: 'uuid',
    description: 'An active station at your school',
  })
  @IsUUID()
  pickupStationId!: string;

  @ApiProperty({ enum: PaymentMethod, enumName: 'PaymentMethod' })
  @IsEnum(PaymentMethod, {
    message: 'paymentMethod must be CARD, BANK_TRANSFER, OPAY or PALMPAY',
  })
  paymentMethod!: PaymentMethod;

  @ApiProperty({
    format: 'uuid',
    description:
      'crypto.randomUUID() made when the checkout page opens. Sending it again returns the same order.',
  })
  @IsUUID()
  idempotencyKey!: string;
}

export class CheckoutResultDto {
  @ApiProperty({ format: 'uuid' })
  orderId!: string;

  @ApiProperty({ description: 'What the buyer pays, in kobo' })
  totalKobo!: number;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      "Paystack's payment page. null until payments are switched on (Phase 5).",
  })
  authorizationUrl!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Payment reference',
  })
  reference!: string | null;
}

export class PickupStationDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  address!: string;

  @ApiProperty()
  contactName!: string;

  @ApiProperty()
  contactPhone!: string;

  @ApiProperty({ type: [OpeningHoursDto] })
  openingHours!: OpeningHoursDto[];
}

export class OrderSellerDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'Store name, else username, else first name' })
  storeName!: string;
}

export class OrderItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  listingId!: string;

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  variantId!: string | null;

  @ApiProperty({ description: 'The title when the order was placed' })
  title!: string;

  @ApiProperty({ type: String, nullable: true })
  variantLabel!: string | null;

  @ApiProperty({ type: String, nullable: true })
  imageUrl!: string | null;

  @ApiProperty({ description: 'Price paid for one, in kobo' })
  unitPriceKobo!: number;

  @ApiProperty()
  quantity!: number;
}

export class SellerOrderSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'CM-7F3K2Q' })
  code!: string;

  @ApiProperty({ type: OrderSellerDto })
  seller!: OrderSellerDto;

  @ApiProperty({ enum: FulfillmentStatus, enumName: 'FulfillmentStatus' })
  fulfillmentStatus!: FulfillmentStatus;

  @ApiProperty()
  subtotalKobo!: number;

  @ApiProperty({ description: 'Units across its items' })
  itemCount!: number;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'First item photo',
  })
  imageUrl!: string | null;
}

export class SellerOrderDto extends SellerOrderSummaryDto {
  @ApiProperty({
    description:
      "6 digits the buyer gives the agent at collection. Only the buyer's own order includes it.",
  })
  collectionCode!: string;

  @ApiProperty({ type: [OrderItemDto] })
  items!: OrderItemDto[];

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  dropOffDeadline!: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  droppedOffAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  collectedAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  cancelledAt!: Date | null;

  @ApiProperty({ type: String, nullable: true })
  cancelReason!: string | null;
}

export class OrderStationDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;
}

export class OrderSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: OrderStatus, enumName: 'OrderStatus' })
  status!: OrderStatus;

  @ApiProperty({ enum: PaymentMethod, enumName: 'PaymentMethod' })
  paymentMethod!: PaymentMethod;

  @ApiProperty()
  totalKobo!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'An unpaid order is released after this',
  })
  expiresAt!: Date;

  @ApiProperty({ type: OrderStationDto })
  pickupStation!: OrderStationDto;

  @ApiProperty({ type: [SellerOrderSummaryDto] })
  sellerOrders!: SellerOrderSummaryDto[];
}

export class OrderDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: OrderStatus, enumName: 'OrderStatus' })
  status!: OrderStatus;

  @ApiProperty({ enum: PaymentMethod, enumName: 'PaymentMethod' })
  paymentMethod!: PaymentMethod;

  @ApiProperty()
  subtotalKobo!: number;

  @ApiProperty()
  totalKobo!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'An unpaid order is released after this',
  })
  expiresAt!: Date;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  paidAt!: Date | null;

  @ApiProperty({ type: PickupStationDto })
  pickupStation!: PickupStationDto;

  @ApiProperty({ type: [SellerOrderDto] })
  sellerOrders!: SellerOrderDto[];
}

export class OrderPageDto {
  @ApiProperty({ type: [OrderSummaryDto] })
  items!: OrderSummaryDto[];

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  nextCursor!: string | null;
}
