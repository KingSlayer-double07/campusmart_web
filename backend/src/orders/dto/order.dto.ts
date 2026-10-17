import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';
import { OpeningHoursDto } from '../../admin/dto/opening-hours.dto';
import { MAX_CART_LINES } from '../../cart/cart-rules';
import { PHONE_MESSAGE, PHONE_RE } from '../../common/phone';
import { Trim } from '../../common/transforms';
import {
  DeliveryMethod,
  FulfillmentStatus,
  OrderStatus,
  PaymentMethod,
} from '../../generated/prisma/enums';

// How one store's items reach the buyer (decision DM1)
export class StoreDeliveryDto {
  @ApiProperty({ format: 'uuid', description: 'A seller in your cart' })
  @IsUUID()
  sellerId!: string;

  @ApiProperty({
    enum: DeliveryMethod,
    enumName: 'DeliveryMethod',
    description:
      'DISPATCH: a rider brings it. SELLER_PICKUP: you collect from the seller, only if they offer it.',
  })
  @IsEnum(DeliveryMethod, {
    message: 'method must be DISPATCH or SELLER_PICKUP',
  })
  method!: DeliveryMethod;
}

// One destination for everything that goes by dispatch (decision DF6): a campus place, or an
// address off campus, where the fee is settled outside the app (DF4)
export class DeliveryDestinationDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'An active campus place at your school',
  })
  @IsOptional()
  @IsUUID()
  campusPlaceId?: string;

  @ApiPropertyOptional({
    minLength: 5,
    maxLength: 300,
    example: '14 Akoka Road, Yaba',
    description: 'Off campus: the address the rider brings it to',
  })
  @IsOptional()
  @Trim()
  @IsString()
  @Length(5, 300, { message: 'The address must be 5 to 300 characters' })
  address?: string;
}

export class CheckoutDto {
  @ApiProperty({
    type: [StoreDeliveryDto],
    description: 'One entry per store in your cart',
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'Choose delivery or pickup for each store' })
  @ArrayMaxSize(MAX_CART_LINES)
  @ValidateNested({ each: true })
  @Type(() => StoreDeliveryDto)
  stores!: StoreDeliveryDto[];

  @ApiPropertyOptional({
    type: DeliveryDestinationDto,
    description:
      'Needed when any store goes by dispatch: exactly one of campusPlaceId or address',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => DeliveryDestinationDto)
  destination?: DeliveryDestinationDto;

  @ApiPropertyOptional({
    example: '+234 801 234 5678',
    description:
      'Needed when any store goes by dispatch, so the rider can call you (decisions PH2, C9). Saved to your profile.',
  })
  @IsOptional()
  @Trim()
  @IsString()
  @Matches(PHONE_RE, { message: PHONE_MESSAGE })
  phone?: string;

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

  @ApiProperty({
    description: 'What the buyer pays, in kobo: items plus the delivery fee',
  })
  totalKobo!: number;

  @ApiProperty({
    description: 'false until online payment is switched on',
  })
  paymentsEnabled!: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      "Paystack's payment page. null while payments are off, or when Paystack couldn't be reached: the buyer can try again from the order (POST /orders/:id/pay).",
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

export class CampusPlaceDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Moremi Hall' })
  name!: string;
}

// Where the rider brings everything that goes by dispatch (decision DF6)
export class OrderDestinationDto {
  @ApiProperty({ type: CampusPlaceDto, nullable: true })
  campusPlace!: CampusPlaceDto | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Off campus: the address the buyer typed',
  })
  address!: string | null;
}

// Where the buyer collects a store's items themselves (decisions DL1, SA2, SA3)
export class SellerPickupDto {
  @ApiProperty({ example: 'Moremi Hall' })
  area!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Shown once the order is paid',
  })
  address!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Shown once the order is paid',
  })
  phone!: string | null;
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

  @ApiProperty({
    enum: DeliveryMethod,
    enumName: 'DeliveryMethod',
    nullable: true,
    description: 'Empty on orders placed through a pickup station',
  })
  deliveryMethod!: DeliveryMethod | null;

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
      "The code the buyer gives at handover. Only the buyer's own order includes it.",
  })
  collectionCode!: string;

  @ApiProperty({
    type: SellerPickupDto,
    nullable: true,
    description: 'Set when you collect from the seller (SELLER_PICKUP)',
  })
  pickupFrom!: SellerPickupDto | null;

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

  @ApiProperty({
    type: OrderStationDto,
    nullable: true,
    description: 'Only on orders placed through a pickup station',
  })
  pickupStation!: OrderStationDto | null;

  @ApiProperty({
    type: OrderDestinationDto,
    nullable: true,
    description: 'Set when any store goes by dispatch',
  })
  destination!: OrderDestinationDto | null;

  @ApiProperty({ description: 'In kobo, once per order' })
  deliveryFeeKobo!: number;

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

  @ApiProperty({
    type: PickupStationDto,
    nullable: true,
    description: 'Only on orders placed through a pickup station',
  })
  pickupStation!: PickupStationDto | null;

  @ApiProperty({
    type: OrderDestinationDto,
    nullable: true,
    description: 'Set when any store goes by dispatch',
  })
  destination!: OrderDestinationDto | null;

  @ApiProperty({
    description:
      'In kobo, once per order: the campus fee when anything goes by dispatch to a campus place, else 0 (off campus it is settled outside the app)',
  })
  deliveryFeeKobo!: number;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'The number the rider calls, when any store goes by dispatch',
  })
  buyerPhone!: string | null;

  @ApiProperty({ type: [SellerOrderDto] })
  sellerOrders!: SellerOrderDto[];
}

export class OrderPageDto {
  @ApiProperty({ type: [OrderSummaryDto] })
  items!: OrderSummaryDto[];

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  nextCursor!: string | null;
}
