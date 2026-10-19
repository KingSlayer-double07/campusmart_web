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
import { AdminOnly } from '../admin/admin.guards';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApiOkEnvelope } from '../common/swagger/api-envelope.decorator';
import { ErrorResponseDto } from '../common/swagger/error-response.dto';
import {
  AdminDisputeDto,
  AdminDisputePageDto,
  AdminProblemPageDto,
  AdminRefundDto,
  AdminRefundResultDto,
  ClosedProblemDto,
  CloseProblemDto,
  ListDisputesQueryDto,
  ListProblemsQueryDto,
  ResolveDisputeDto,
} from './dto/problem.dto';
import { ProblemsService } from './problems.service';

const uuid = new ParseUUIDPipe();

// Guide 9.1 Disputes, built with Phase 6: disputes, reports before handover, and refunds an
// admin decides (F8, F9, DX6, DL8)
@ApiTags('Admin')
@AdminOnly()
@Controller('admin')
export class AdminDisputesController {
  constructor(private readonly problems: ProblemsService) {}

  @ApiOperation({ summary: 'Disputes', description: 'Open ones oldest first' })
  @ApiOkEnvelope(AdminDisputePageDto)
  @Get('disputes')
  disputes(@Query() query: ListDisputesQueryDto): Promise<AdminDisputePageDto> {
    return this.problems.disputes(query);
  }

  @ApiOperation({ summary: 'One dispute' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkEnvelope(AdminDisputeDto)
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  @Get('disputes/:id')
  dispute(@Param('id', uuid) id: string): Promise<AdminDisputeDto> {
    return this.problems.dispute(id);
  }

  @ApiOperation({
    summary: 'Decide a dispute',
    description:
      'REFUND (with whose fault it was) or RELEASE, with a note both sides see. Returning an item is arranged outside the app (F9).',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkEnvelope(AdminDisputeDto)
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  @ApiResponse({
    status: 409,
    type: ErrorResponseDto,
    description: 'DISPUTE_RESOLVED',
  })
  @HttpCode(HttpStatus.OK)
  @Post('disputes/:id/resolve')
  resolve(
    @Param('id', uuid) id: string,
    @Body() dto: ResolveDisputeDto,
    @CurrentUser() admin: AuthUser,
  ): Promise<AdminDisputeDto> {
    return this.problems.resolve(id, dto, admin.id);
  }

  @ApiOperation({
    summary: 'Problems reported before handover',
    description:
      'From buyers (late, lost) and riders (a buyer who didn’t show)',
  })
  @ApiOkEnvelope(AdminProblemPageDto)
  @Get('problems')
  list(@Query() query: ListProblemsQueryDto): Promise<AdminProblemPageDto> {
    return this.problems.problems(query);
  }

  @ApiOperation({
    summary: 'Close a reported problem',
    description: 'With a note of what was done',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkEnvelope(ClosedProblemDto)
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  @ApiResponse({
    status: 409,
    type: ErrorResponseDto,
    description: 'PROBLEM_CLOSED',
  })
  @HttpCode(HttpStatus.OK)
  @Post('problems/:id/close')
  close(
    @Param('id', uuid) id: string,
    @Body() dto: CloseProblemDto,
    @CurrentUser() admin: AuthUser,
  ): Promise<ClosedProblemDto> {
    return this.problems.closeProblem(id, dto, admin.id);
  }

  @ApiOperation({
    summary: 'Refund one store’s order',
    description:
      'For a case you decide yourself: a parcel lost with the rider (DX6) or a buyer who didn’t show (DL8). Say whose fault it was (P6).',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'The seller order' })
  @ApiOkEnvelope(AdminRefundResultDto)
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  @ApiResponse({
    status: 409,
    type: ErrorResponseDto,
    description: 'NOT_REFUNDABLE or DISPUTE_OPEN',
  })
  @HttpCode(HttpStatus.OK)
  @Post('seller-orders/:id/refund')
  refund(
    @Param('id', uuid) id: string,
    @Body() dto: AdminRefundDto,
    @CurrentUser() admin: AuthUser,
  ): Promise<AdminRefundResultDto> {
    return this.problems.adminRefund(id, dto, admin.id);
  }
}
