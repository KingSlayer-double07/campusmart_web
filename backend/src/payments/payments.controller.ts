import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnauthorizedException,
  type RawBodyRequest,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiExcludeEndpoint,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireVerifiedEmail } from '../auth/decorators/require-verified-email.decorator';
import { ApiOkEnvelope } from '../common/swagger/api-envelope.decorator';
import { ErrorResponseDto } from '../common/swagger/error-response.dto';
import type { Env } from '../config/env';
import { PaystackService } from '../paystack/paystack.service';
import {
  PaymentConfigDto,
  StartedPaymentDto,
  VerifiedPaymentDto,
} from './dto/payments.dto';
import { PaymentsService, type PaystackEvent } from './payments.service';

// Public: what checkout should offer, and Paystack's webhook (guide 5.2)
@ApiTags('Payments')
@Controller('payments')
export class PaymentsPublicController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly paystack: PaystackService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @ApiOperation({
    summary:
      'Whether online payment is on, and which ways to pay checkout offers',
  })
  @ApiOkEnvelope(PaymentConfigDto)
  @Get('config')
  configuration(): PaymentConfigDto {
    return {
      paymentsEnabled: this.payments.enabled,
      methods: this.payments.methods(),
    };
  }

  // Guide 5.2: the signature over the raw body proves it's Paystack; in production the source IP
  // must also be one of Paystack's. Processed in the same request; an error makes Paystack retry.
  @ApiExcludeEndpoint()
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  @Post('webhook')
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-paystack-signature') signature: string | undefined,
  ): Promise<{ received: true }> {
    if (this.config.get('NODE_ENV', { infer: true }) === 'production') {
      const allowed = this.config
        .get('PAYSTACK_WEBHOOK_IPS', { infer: true })
        .split(',')
        .map((ip) => ip.trim());
      const ip = (req.ip ?? '').replace(/^::ffff:/, '');
      if (!allowed.includes(ip)) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'Unknown source',
        });
      }
    }
    if (!this.paystack.verifySignature(req.rawBody, signature)) {
      throw new UnauthorizedException({
        code: 'INVALID_SIGNATURE',
        message: 'Invalid signature',
      });
    }
    const event = req.body as PaystackEvent;
    if (
      typeof event?.event === 'string' &&
      event.data &&
      typeof event.data === 'object'
    ) {
      await this.payments.handleEvent(event);
    }
    return { received: true };
  }
}

@ApiTags('Payments')
@RequireVerifiedEmail()
@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @ApiOperation({
    summary: 'Ask Paystack about a payment',
    description:
      "Guide 5.3: the confirmation page calls this once when the webhook hasn't marked the order paid after 10 seconds. It runs the same handler as the webhook.",
  })
  @ApiParam({ name: 'reference', example: 'CM_<orderId>_1' })
  @ApiOkEnvelope(VerifiedPaymentDto)
  @ApiResponse({
    status: 404,
    type: ErrorResponseDto,
    description: 'Not your payment',
  })
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
  @Get('payments/verify/:reference')
  verify(
    @Param('reference') reference: string,
    @CurrentUser() user: AuthUser,
  ): Promise<VerifiedPaymentDto> {
    return this.payments.verifyForBuyer(user, reference);
  }

  @ApiOperation({
    summary: 'Try paying again',
    description:
      'Decision P7: a new Paystack payment, with a new reference, for an order still waiting for payment',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkEnvelope(StartedPaymentDto, { status: 201 })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  @ApiResponse({
    status: 409,
    type: ErrorResponseDto,
    description: 'ORDER_NOT_PAYABLE',
  })
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
  @Post('orders/:id/pay')
  pay(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<StartedPaymentDto> {
    return this.payments.retry(user, id);
  }
}
