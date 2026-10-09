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
import { RequireVerifiedEmail } from '../auth/decorators/require-verified-email.decorator';
import { CursorQueryDto } from '../common/pagination';
import { ApiOkEnvelope } from '../common/swagger/api-envelope.decorator';
import { ErrorResponseDto } from '../common/swagger/error-response.dto';
import { CheckoutService } from './checkout.service';
import {
  CheckoutDto,
  CheckoutResultDto,
  OrderDto,
  OrderPageDto,
  PickupStationDto,
} from './dto/order.dto';
import { OrdersService } from './orders.service';

// Guide 4.2. Every route is the signed-in buyer's own: someone else's order is 404.
@ApiTags('Orders')
@RequireVerifiedEmail()
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
    summary: 'Turn the cart into an order',
    description:
      'Reserves stock and snapshots prices from the database in one transaction; the client sends no prices. The same idempotencyKey returns the same order. authorizationUrl is null until payments are switched on.',
  })
  @ApiOkEnvelope(CheckoutResultDto, { status: 201 })
  @ApiResponse({
    status: 400,
    type: ErrorResponseDto,
    description: 'CART_EMPTY or VALIDATION_FAILED',
  })
  @ApiResponse({
    status: 404,
    type: ErrorResponseDto,
    description: 'No such active station at your school',
  })
  @ApiResponse({
    status: 409,
    type: ErrorResponseDto,
    description:
      'OUT_OF_STOCK or ITEM_UNAVAILABLE (details name the item), or IDEMPOTENCY_KEY_REUSED',
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
    description: "Includes each seller order's collection code (yours only)",
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
