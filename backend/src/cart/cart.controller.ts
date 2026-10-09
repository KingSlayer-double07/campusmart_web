import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireVerifiedEmail } from '../auth/decorators/require-verified-email.decorator';
import { ApiOkEnvelope } from '../common/swagger/api-envelope.decorator';
import { ErrorResponseDto } from '../common/swagger/error-response.dto';
import { CartService } from './cart.service';
import { CartDto, MergeCartDto, SetCartItemDto } from './dto/cart.dto';

// Guide 4.1, D14: the signed-in buyer's cart lives on the server. Every route is scoped to the
// buyer's school, which must be switched on (403 NO_INSTITUTION / INSTITUTION_INACTIVE).
@ApiTags('Cart')
@RequireVerifiedEmail()
@Controller('cart')
export class CartController {
  constructor(private readonly cart: CartService) {}

  @ApiOperation({
    summary: 'Your cart, grouped by seller',
    description:
      'issues lists lines that sold out, ran low, went away or changed price since they were set',
  })
  @ApiOkEnvelope(CartDto)
  @Get()
  get(@CurrentUser() user: AuthUser): Promise<CartDto> {
    return this.cart.get(user);
  }

  @ApiOperation({
    summary: 'Set how many of an item are in the cart',
    description: 'The absolute quantity; 0 removes the line. Returns the cart.',
  })
  @ApiOkEnvelope(CartDto)
  @ApiResponse({
    status: 400,
    type: ErrorResponseDto,
    description: 'VARIANT_REQUIRED, OWN_LISTING or VALIDATION_FAILED',
  })
  @ApiResponse({
    status: 404,
    type: ErrorResponseDto,
    description: 'Not live, or at another school',
  })
  @ApiResponse({
    status: 409,
    type: ErrorResponseDto,
    description: 'OUT_OF_STOCK (details.available) or CART_FULL (50 lines)',
  })
  @Put('items')
  setItem(
    @Body() dto: SetCartItemDto,
    @CurrentUser() user: AuthUser,
  ): Promise<CartDto> {
    return this.cart.setItem(user, dto);
  }

  @ApiOperation({ summary: 'Remove a line from the cart' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Removed' })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  @Delete('items/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeItem(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    await this.cart.removeItem(user, id);
  }

  @ApiOperation({
    summary: "Merge this device's guest cart after sign-in",
    description:
      'Keeps the larger quantity per line, capped at the stock left. Lines that can no longer be bought are skipped. Returns the cart.',
  })
  @ApiOkEnvelope(CartDto)
  @Post('merge')
  @HttpCode(HttpStatus.OK)
  merge(
    @Body() dto: MergeCartDto,
    @CurrentUser() user: AuthUser,
  ): Promise<CartDto> {
    return this.cart.merge(user, dto);
  }
}
