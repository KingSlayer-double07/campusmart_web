import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireVerifiedEmail } from '../auth/decorators/require-verified-email.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CursorQueryDto } from '../common/pagination';
import { ApiOkEnvelope } from '../common/swagger/api-envelope.decorator';
import { ErrorResponseDto } from '../common/swagger/error-response.dto';
import { UserRole } from '../generated/prisma/enums';
import {
  BankDto,
  PayoutAccountDto,
  PayoutPageDto,
  SetPayoutAccountDto,
} from './dto/payments.dto';
import { PayoutAccountsService } from './payout-accounts.service';

// Guide 5.4 (SELLER). Class decorators apply bottom-up, so RolesGuard runs after sign-in.
@ApiTags('Payouts')
@UseGuards(RolesGuard)
@RequireVerifiedEmail()
@Roles(UserRole.SELLER)
@ApiResponse({
  status: 403,
  type: ErrorResponseDto,
  description: 'Not a seller',
})
@Controller()
export class PayoutsController {
  constructor(private readonly accounts: PayoutAccountsService) {}

  @ApiOperation({
    summary: 'Nigerian banks you can be paid into',
    description: 'From Paystack, cached for 24 hours',
  })
  @ApiOkEnvelope([BankDto])
  @ApiResponse({
    status: 502,
    type: ErrorResponseDto,
    description: 'PAYMENT_PROVIDER_ERROR',
  })
  @ApiResponse({
    status: 503,
    type: ErrorResponseDto,
    description: 'PAYMENTS_NOT_CONFIGURED',
  })
  @Get('payouts/banks')
  banks(): Promise<BankDto[]> {
    return this.accounts.banks();
  }

  @ApiOperation({ summary: 'Your payout account' })
  @ApiOkEnvelope(PayoutAccountDto)
  @Get('sellers/me/payout-account')
  account(@CurrentUser() user: AuthUser): Promise<PayoutAccountDto> {
    return this.accounts.account(user.id);
  }

  @ApiOperation({
    summary: 'Set or change your payout account',
    description:
      "Paystack checks the account name and creates a transfer recipient; the full account number isn't stored. " +
      'Payouts wait 24 hours after a change, and you are told by notification and email (decision P9).',
  })
  @ApiOkEnvelope(PayoutAccountDto, { status: 201 })
  @ApiResponse({
    status: 400,
    type: ErrorResponseDto,
    description: 'VALIDATION_FAILED',
  })
  @ApiResponse({
    status: 502,
    type: ErrorResponseDto,
    description:
      "PAYMENT_PROVIDER_ERROR, e.g. Paystack couldn't resolve the account",
  })
  @ApiResponse({
    status: 503,
    type: ErrorResponseDto,
    description: 'PAYMENTS_NOT_CONFIGURED',
  })
  @Post('sellers/me/payout-account')
  setAccount(
    @Body() dto: SetPayoutAccountDto,
    @CurrentUser() user: AuthUser,
  ): Promise<PayoutAccountDto> {
    return this.accounts.setAccount(user, dto);
  }

  @ApiOperation({ summary: 'Your payouts, newest first' })
  @ApiOkEnvelope(PayoutPageDto)
  @Get('sellers/me/payouts')
  payouts(
    @Query() query: CursorQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<PayoutPageDto> {
    return this.accounts.list(user.id, query);
  }
}
