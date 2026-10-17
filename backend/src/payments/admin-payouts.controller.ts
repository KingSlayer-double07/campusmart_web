import {
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
import { AdminOnly } from '../admin/admin.guards';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { cursorArgs, toPage } from '../common/pagination';
import { ApiOkEnvelope } from '../common/swagger/api-envelope.decorator';
import { ErrorResponseDto } from '../common/swagger/error-response.dto';
import type { Prisma } from '../generated/prisma/client';
import { sellerDisplayName } from '../listings/listing-rules';
import { PrismaService } from '../prisma/prisma.service';
import {
  AdminPayoutDto,
  AdminPayoutPageDto,
  ListAdminPayoutsQueryDto,
} from './dto/payments.dto';
import { PayoutsService } from './payouts.service';

const payoutSelect = {
  id: true,
  sellerId: true,
  amountKobo: true,
  status: true,
  attempt: true,
  failureReason: true,
  createdAt: true,
  paidAt: true,
  sellerOrder: {
    select: {
      code: true,
      seller: {
        select: {
          username: true,
          firstName: true,
          sellerProfile: { select: { storeName: true } },
        },
      },
    },
  },
} satisfies Prisma.PayoutSelect;

const toDto = ({
  sellerOrder,
  ...p
}: Prisma.PayoutGetPayload<{
  select: typeof payoutSelect;
}>): AdminPayoutDto => ({
  ...p,
  sellerOrderCode: sellerOrder.code,
  storeName: sellerDisplayName(sellerOrder.seller),
});

// Guide 9.1 Payouts, built with Phase 5 (decision W1)
@ApiTags('Admin')
@AdminOnly()
@Controller('admin/payouts')
export class AdminPayoutsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payouts: PayoutsService,
  ) {}

  @ApiOperation({
    summary: 'List payouts',
    description:
      'Newest first; filter by status, e.g. FAILED or AWAITING_ACCOUNT',
  })
  @ApiOkEnvelope(AdminPayoutPageDto)
  @Get()
  async list(
    @Query() query: ListAdminPayoutsQueryDto,
  ): Promise<AdminPayoutPageDto> {
    const rows = await this.prisma.payout.findMany({
      where: query.status ? { status: query.status } : {},
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: payoutSelect,
      ...cursorArgs(query),
    });
    const page = toPage(rows, query.limit);
    return { ...page, items: page.items.map(toDto) };
  }

  @ApiOperation({
    summary: 'Retry a failed payout',
    description: 'Sends it again with a new reference; logged with your id',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkEnvelope(AdminPayoutDto)
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  @ApiResponse({
    status: 409,
    type: ErrorResponseDto,
    description: 'PAYOUT_NOT_RETRYABLE',
  })
  @HttpCode(HttpStatus.OK)
  @Post(':id/retry')
  async retry(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() admin: AuthUser,
  ): Promise<AdminPayoutDto> {
    await this.payouts.retry(id, admin.id);
    return toDto(
      await this.prisma.payout.findUniqueOrThrow({
        where: { id },
        select: payoutSelect,
      }),
    );
  }
}
