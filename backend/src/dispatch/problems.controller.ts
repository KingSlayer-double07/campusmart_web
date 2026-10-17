import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth-user';
import { BuyerAccess } from '../auth/decorators/buyer-access.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApiOkEnvelope } from '../common/swagger/api-envelope.decorator';
import { ErrorResponseDto } from '../common/swagger/error-response.dto';
import { ReportProblemDto, ReportResultDto } from './dto/problem.dto';
import { ProblemsService } from './problems.service';

const uuid = new ParseUUIDPipe();

// Decision C8: "Report a problem", from payment until 48 hours after handover
@ApiTags('Orders')
@BuyerAccess()
@Controller('orders/:orderId/seller-orders')
export class ProblemsController {
  constructor(private readonly problems: ProblemsService) {}

  @ApiOperation({
    summary: 'Report a problem with one store’s order',
    description:
      'Before handover it alerts CampusMart (LATE, LOST, OTHER). After handover, until releaseAt, it opens a dispute that holds the seller’s payout (F6, F7).',
  })
  @ApiParam({ name: 'orderId', format: 'uuid' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'The seller order' })
  @ApiOkEnvelope(ReportResultDto, { status: 201 })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  @ApiResponse({
    status: 400,
    type: ErrorResponseDto,
    description: 'VALIDATION_FAILED or INVALID_IMAGE',
  })
  @ApiResponse({
    status: 409,
    type: ErrorResponseDto,
    description: 'CANNOT_REPORT, ALREADY_REPORTED or DISPUTE_WINDOW_CLOSED',
  })
  @Post(':id/problems')
  report(
    @CurrentUser() buyer: AuthUser,
    @Param('orderId', uuid) orderId: string,
    @Param('id', uuid) id: string,
    @Body() dto: ReportProblemDto,
  ): Promise<ReportResultDto> {
    return this.problems.report(buyer, orderId, id, dto);
  }
}
