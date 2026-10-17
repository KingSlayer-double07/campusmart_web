import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApiOkEnvelope } from '../common/swagger/api-envelope.decorator';
import { ErrorResponseDto } from '../common/swagger/error-response.dto';
import { DeliveryJobsService } from './delivery-jobs.service';
import {
  AcceptJobDto,
  ArrivalTimesDto,
  DeliveryJobDto,
  DeliveryJobPageDto,
  HandoverCodeDto,
  ListJobsQueryDto,
  NotReadyDto,
  PickupCodeDto,
} from './dto/delivery-job.dto';
import { ReportResultDto, RiderProblemDto } from './dto/problem.dto';
import { ProblemsService } from './problems.service';
import { RiderOnly } from './rider-only.decorator';

const uuid = new ParseUUIDPipe();

// Phase 6: the rider app's API. Every query is limited to the rider's campus, and to jobs that
// are open or theirs (404 otherwise).
@ApiTags('Dispatch')
@RiderOnly()
@ApiResponse({ status: 404, type: ErrorResponseDto })
@Controller('dispatch/jobs')
export class RiderJobsController {
  constructor(
    private readonly jobs: DeliveryJobsService,
    private readonly problems: ProblemsService,
  ) {}

  @ApiOperation({
    summary: 'Jobs',
    description:
      'OPEN: waiting for a rider at your campus, oldest first. MINE: yours in progress. DONE: yours finished.',
  })
  @ApiOkEnvelope(DeliveryJobPageDto)
  @Get()
  list(
    @CurrentUser() rider: AuthUser,
    @Query() query: ListJobsQueryDto,
  ): Promise<DeliveryJobPageDto> {
    return this.jobs.list(rider, query);
  }

  @ApiOperation({
    summary: 'One job',
    description:
      'Before you accept, only the pickup and drop-off areas show (C6)',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkEnvelope(DeliveryJobDto)
  @Get(':id')
  detail(
    @CurrentUser() rider: AuthUser,
    @Param('id', uuid) id: string,
  ): Promise<DeliveryJobDto> {
    return this.jobs.detail(rider, id);
  }

  @ApiOperation({
    summary: 'Accept a job',
    description:
      'With an arrival window for each store (DF8b). The first rider to accept takes it (DX2).',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkEnvelope(DeliveryJobDto)
  @ApiResponse({
    status: 400,
    type: ErrorResponseDto,
    description: 'WINDOW_REQUIRED or VALIDATION_FAILED',
  })
  @ApiResponse({
    status: 409,
    type: ErrorResponseDto,
    description: 'JOB_TAKEN',
  })
  @HttpCode(HttpStatus.OK)
  @Post(':id/accept')
  accept(
    @CurrentUser() rider: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: AcceptJobDto,
  ): Promise<DeliveryJobDto> {
    return this.jobs.accept(rider, id, dto);
  }

  @ApiOperation({ summary: 'Change your arrival window at a store' })
  @ApiParam({ name: 'sellerOrderId', format: 'uuid' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkEnvelope(DeliveryJobDto)
  @ApiResponse({
    status: 409,
    type: ErrorResponseDto,
    description: 'STOP_NOT_WAITING or JOB_NOT_YOURS',
  })
  @Patch(':id/stops/:sellerOrderId/window')
  updateWindow(
    @CurrentUser() rider: AuthUser,
    @Param('id', uuid) id: string,
    @Param('sellerOrderId', uuid) sellerOrderId: string,
    @Body() dto: ArrivalTimesDto,
  ): Promise<DeliveryJobDto> {
    return this.jobs.updateWindow(rider, id, sellerOrderId, dto);
  }

  @ApiOperation({
    summary: 'Collect from a store',
    description:
      "Enter or scan the store's CM- code; its parcel is now with you (DX5)",
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkEnvelope(DeliveryJobDto)
  @ApiResponse({
    status: 400,
    type: ErrorResponseDto,
    description: 'WRONG_CODE',
  })
  @ApiResponse({
    status: 409,
    type: ErrorResponseDto,
    description: 'ALREADY_PICKED_UP, STOP_NOT_WAITING or JOB_NOT_YOURS',
  })
  @HttpCode(HttpStatus.OK)
  @Post(':id/pickups')
  pickup(
    @CurrentUser() rider: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: PickupCodeDto,
  ): Promise<DeliveryJobDto> {
    return this.jobs.pickup(rider, id, dto.code);
  }

  @ApiOperation({
    summary: 'Report a store not ready',
    description:
      'Or the seller not there (DF11). Deliver the rest and come back before its deadline.',
  })
  @ApiParam({ name: 'sellerOrderId', format: 'uuid' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkEnvelope(DeliveryJobDto)
  @HttpCode(HttpStatus.OK)
  @Post(':id/stops/:sellerOrderId/not-ready')
  notReady(
    @CurrentUser() rider: AuthUser,
    @Param('id', uuid) id: string,
    @Param('sellerOrderId', uuid) sellerOrderId: string,
    @Body() dto: NotReadyDto,
  ): Promise<DeliveryJobDto> {
    return this.jobs.notReady(rider, id, sellerOrderId, dto);
  }

  @ApiOperation({
    summary: 'Hand over to the buyer',
    description:
      "The buyer's 3-digit code for one store (DL5). 5 wrong codes lock it (F5).",
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkEnvelope(DeliveryJobDto)
  @ApiResponse({
    status: 400,
    type: ErrorResponseDto,
    description: 'WRONG_CODE, with triesLeft',
  })
  @ApiResponse({
    status: 409,
    type: ErrorResponseDto,
    description: 'NOT_READY_FOR_HANDOVER or JOB_NOT_YOURS',
  })
  @ApiResponse({
    status: 423,
    type: ErrorResponseDto,
    description: 'HANDOVER_LOCKED',
  })
  @HttpCode(HttpStatus.OK)
  @Post(':id/handovers')
  handOver(
    @CurrentUser() rider: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: HandoverCodeDto,
  ): Promise<DeliveryJobDto> {
    return this.jobs.handOver(rider, id, dto);
  }

  @ApiOperation({
    summary: 'Give a job back',
    description:
      'Only while you carry nothing from it. It opens to riders again and admins are told (C5).',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkEnvelope(DeliveryJobDto)
  @ApiResponse({
    status: 409,
    type: ErrorResponseDto,
    description: 'PARCELS_WITH_RIDER or JOB_NOT_YOURS',
  })
  @HttpCode(HttpStatus.OK)
  @Post(':id/drop')
  drop(
    @CurrentUser() rider: AuthUser,
    @Param('id', uuid) id: string,
  ): Promise<DeliveryJobDto> {
    return this.jobs.drop(rider, id);
  }

  @ApiOperation({
    summary: 'Report a problem with a job',
    description:
      'A buyer who didn’t show (DL8), or anything else. CampusMart’s admins are alerted and decide.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkEnvelope(ReportResultDto, { status: 201 })
  @Post(':id/problems')
  report(
    @CurrentUser() rider: AuthUser,
    @Param('id', uuid) id: string,
    @Body() dto: RiderProblemDto,
  ): Promise<ReportResultDto> {
    return this.problems.riderReport(rider, id, dto);
  }
}
