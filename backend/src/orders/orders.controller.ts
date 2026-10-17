import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { BuyerAccess } from '../auth/decorators/buyer-access.decorator';
import { CursorQueryDto } from '../common/pagination';
import { ApiOkEnvelope } from '../common/swagger/api-envelope.decorator';
import { ErrorResponseDto } from '../common/swagger/error-response.dto';
import { CheckoutService } from './checkout.service';
import {
  CampusPlaceDto,
  CheckoutDto,
  CheckoutResultDto,
  OrderDto,
  OrderPageDto,
  PickupStationDto,
} from './dto/order.dto';
import { OrdersService } from './orders.service';

// Guide 4.2. Every route is the signed-in buyer's own: someone else's order is 404.
@ApiTags('Orders')
@BuyerAccess()
@Controller()
export class OrdersController {
  constructor(
    private readonly checkoutService: CheckoutService,
    private readonly orders: OrdersService,
  ) {}

  @ApiOperation({ summary: 'Active pickup stations at your school' })
  @ApiOkEnvelope([PickupStationDto])
  @Get('pickup-stations')
  pickupStations(@CurrentUser() user: AuthUser): Promise<PickupStationDto[]> {
    return this.orders.pickupStations(user);
  }

  @ApiOperation({
    summary: 'Places a rider can deliver to at your school',
    description: 'Active campus places, by name (decision DF3)',
  })
  @ApiOkEnvelope([CampusPlaceDto])
  @Get('campus-places')
  campusPlaces(@CurrentUser() user: AuthUser): Promise<CampusPlaceDto[]> {
    return this.orders.campusPlaces(user);
  }

  @ApiOperation({
    summary: 'Turn the cart into an order',
    description:
      'Reserves stock and snapshots prices from the database in one transaction; the client sends no prices. ' +
      'Each store in the cart is delivered by dispatch or collected from the seller. Anything by dispatch needs one destination and a phone number, ' +
      'and the order pays one delivery fee: the campus fee for a campus place, nothing in the app for an address off campus. ' +
      'The same idempotencyKey returns the same order. authorizationUrl is null until payments are switched on.',
  })
  @ApiOkEnvelope(CheckoutResultDto, { status: 201 })
  @ApiResponse({
    status: 400,
    type: ErrorResponseDto,
    description:
      'CART_EMPTY, DELIVERY_CHOICE_REQUIRED (details.sellerId), DESTINATION_REQUIRED, PHONE_REQUIRED or VALIDATION_FAILED',
  })
  @ApiResponse({
    status: 404,
    type: ErrorResponseDto,
    description: 'No such active campus place at your school',
  })
  @ApiResponse({
    status: 409,
    type: ErrorResponseDto,
    description:
      'OUT_OF_STOCK or ITEM_UNAVAILABLE (details name the item), PICKUP_NOT_OFFERED (details.sellerId), DELIVERY_UNAVAILABLE (no campus fee set yet), or IDEMPOTENCY_KEY_REUSED',
  })
  @Post('orders/checkout')
  checkout(
    @Body() dto: CheckoutDto,
    @CurrentUser() user: AuthUser,
  ): Promise<CheckoutResultDto> {
    return this.checkoutService.checkout(user, dto);
  }

  @ApiOperation({ summary: 'Your orders, newest first' })
  @ApiOkEnvelope(OrderPageDto)
  @Get('orders')
  list(
    @Query() query: CursorQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<OrderPageDto> {
    return this.orders.list(user, query);
  }

  @ApiOperation({
    summary: 'One of your orders',
    description:
      "Includes each seller order's handover code (yours only). For pickup from a seller, their address and phone appear once the order is paid.",
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkEnvelope(OrderDto)
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  @Get('orders/:id')
  detail(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<OrderDto> {
    return this.orders.detail(user, id);
  }

  @ApiOperation({
    summary: 'Cancel an order that is waiting for payment',
    description: 'Its stock goes back on sale',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkEnvelope(OrderDto)
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  @ApiResponse({
    status: 409,
    type: ErrorResponseDto,
    description: 'ORDER_NOT_CANCELLABLE',
  })
  @Post('orders/:id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<OrderDto> {
    return this.orders.cancel(user, id);
  }
}
