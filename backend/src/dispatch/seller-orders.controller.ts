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
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireVerifiedEmail } from '../auth/decorators/require-verified-email.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ApiOkEnvelope } from '../common/swagger/api-envelope.decorator';
import { ErrorResponseDto } from '../common/swagger/error-response.dto';
import { UserRole } from '../generated/prisma/enums';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SellerHandoverDto } from './dto/delivery-job.dto';
import {
  CancelSellerOrderDto,
  ListSellerOrdersQueryDto,
  SellerOrderCountsDto,
  SellerSideOrderDto,
  SellerSideOrderPageDto,
} from './dto/seller-order.dto';
import { SellerOrdersService } from './seller-orders.service';

const uuid = new ParseUUIDPipe();

// Guide 6.2, rebuilt for delivery (Phase 6): the seller's orders, one per store per order
// Class decorators apply bottom-up, so RolesGuard (listed first) runs after the sign-in guards
@ApiTags('Sellers')
@UseGuards(RolesGuard)
@RequireVerifiedEmail()
@Roles(UserRole.SELLER)
@ApiResponse({
  status: 403,
  type: ErrorResponseDto,
  description: 'Not a seller',
})
@Controller('sellers/me/orders')
export class SellerOrdersController {
  constructor(private readonly orders: SellerOrdersService) {}

  @ApiOperation({
    summary: 'Your orders',
    description:
      'By tab. Shows the buyer’s name only, never their email, phone or address.',
  })
  @ApiOkEnvelope(SellerSideOrderPageDto)
  @Get()
  list(
    @CurrentUser() seller: AuthUser,
    @Query() query: ListSellerOrdersQueryDto,
  ): Promise<SellerSideOrderPageDto> {
    return this.orders.list(seller, query);
  }

  @ApiOperation({ summary: 'How many orders are in each tab' })
  @ApiOkEnvelope(SellerOrderCountsDto)
  @Get('counts')
  counts(@CurrentUser() seller: AuthUser): Promise<SellerOrderCountsDto> {
    return this.orders.counts(seller);
  }

  @ApiOperation({ summary: 'One of your orders' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkEnvelope(SellerSideOrderDto)
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  @Get(':id')
  detail(
    @CurrentUser() seller: AuthUser,
    @Param('id', uuid) id: string,
  ): Promise<SellerSideOrderDto> {
    return this.orders.detail(seller, id);
  }

  @ApiOperation({
    summary: 'Cancel an order',
    description:
      'Before it leaves you. The buyer is refunded in full and it counts against your store (F10, P6).',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkEnvelope(SellerSideOrderDto)
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  @ApiResponse({
    status: 409,
    type: ErrorResponseDto,
    description: 'NOT_CANCELLABLE',
  })
  @HttpCode(HttpStatus.OK)
  @Post(':id/cancel')
  cancel(
    @CurrentUser() seller: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: CancelSellerOrderDto,
  ): Promise<SellerSideOrderDto> {
    return this.orders.cancel(seller, id, dto);
  }

  @ApiOperation({
    summary: 'Hand over to a buyer collecting from you',
    description:
      "Enter the buyer's 3-digit code (DL5). 5 wrong codes lock it (F5).",
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkEnvelope(SellerSideOrderDto)
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  @ApiResponse({
    status: 400,
    type: ErrorResponseDto,
    description: 'WRONG_CODE, with triesLeft',
  })
  @ApiResponse({
    status: 409,
    type: ErrorResponseDto,
    description: 'NOT_READY_FOR_HANDOVER',
  })
  @ApiResponse({
    status: 423,
    type: ErrorResponseDto,
    description: 'HANDOVER_LOCKED',
  })
  @HttpCode(HttpStatus.OK)
  @Post(':id/handover')
  handOver(
    @CurrentUser() seller: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: SellerHandoverDto,
  ): Promise<SellerSideOrderDto> {
    return this.orders.handOver(seller, id, dto.code);
  }
}
