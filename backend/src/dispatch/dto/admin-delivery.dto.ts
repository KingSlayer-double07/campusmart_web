import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { CursorQueryDto } from '../../common/pagination';
import { Trim } from '../../common/transforms';
import {
  DeliveryJobStatus,
  DeliveryMethod,
  FulfillmentStatus,
} from '../../generated/prisma/enums';

export const DELIVERY_VIEWS = ['OPEN', 'ACTIVE', 'DONE', 'ALL'] as const;
export type DeliveryView = (typeof DELIVERY_VIEWS)[number];

export class ListDeliveriesQueryDto extends CursorQueryDto {
  @ApiPropertyOptional({
    enum: DELIVERY_VIEWS,
    enumName: 'DeliveryView',
    default: 'OPEN',
    description:
      'OPEN: no rider yet, oldest first. ACTIVE: a rider has it. DONE: delivered or cancelled.',
  })
  @IsOptional()
  @IsIn(DELIVERY_VIEWS)
  view: DeliveryView = 'OPEN';

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  institutionId?: string;
}

export class AdminPersonDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;
}

export class AdminJobStopDto {
  @ApiProperty({ format: 'uuid' })
  sellerOrderId!: string;

  @ApiProperty({ example: 'CM-7F3K2Q' })
  code!: string;

  @ApiProperty()
  storeName!: string;

  @ApiProperty({ type: String, nullable: true })
  area!: string | null;

  @ApiProperty({ enum: FulfillmentStatus, enumName: 'FulfillmentStatus' })
  status!: FulfillmentStatus;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  pickupDeadline!: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  pickedUpAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  notReadyAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  deliveredAt!: Date | null;

  @ApiProperty()
  handoverLocked!: boolean;
}

export class AdminDeliveryJobDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  orderId!: string;

  @ApiProperty({ enum: DeliveryJobStatus, enumName: 'DeliveryJobStatus' })
  status!: DeliveryJobStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  acceptedAt!: Date | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'When admins were told nobody accepted within 5 hours (DX2)',
  })
  unacceptedAlertAt!: Date | null;

  @ApiProperty()
  institutionName!: string;

  @ApiProperty({ type: AdminPersonDto, nullable: true })
  rider!: AdminPersonDto | null;

  @ApiProperty()
  buyerName!: string;

  @ApiProperty({
    example: 'Faculty of Science',
    description: 'Or the off-campus address',
  })
  destination!: string;

  @ApiProperty({ type: [AdminJobStopDto] })
  stops!: AdminJobStopDto[];
}

export class AdminDeliveryJobPageDto {
  @ApiProperty({ type: [AdminDeliveryJobDto] })
  items!: AdminDeliveryJobDto[];

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  nextCursor!: string | null;
}

// Decision C5: after the 5-hour alert, or when a rider drops a job, an admin assigns a rider
export class AssignRiderDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: 'Choose a rider' })
  riderId!: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @Trim()
  @IsString()
  @Length(0, 500)
  reason?: string;
}

export class AdminReasonDto {
  @ApiProperty({ minLength: 3, maxLength: 500 })
  @Trim()
  @IsString({ message: 'Give a reason' })
  @Length(3, 500, { message: 'The reason must be 3 to 500 characters' })
  reason!: string;
}

export class LockedHandoverDto {
  @ApiProperty({ format: 'uuid' })
  sellerOrderId!: string;

  @ApiProperty({ format: 'uuid' })
  orderId!: string;

  @ApiProperty({ example: 'CM-7F3K2Q' })
  code!: string;

  @ApiProperty()
  storeName!: string;

  @ApiProperty()
  buyerName!: string;

  @ApiProperty({
    enum: DeliveryMethod,
    enumName: 'DeliveryMethod',
    nullable: true,
  })
  deliveryMethod!: DeliveryMethod | null;

  @ApiProperty({ type: String, format: 'date-time' })
  lockedAt!: Date;
}

export class LockedHandoverPageDto {
  @ApiProperty({ type: [LockedHandoverDto] })
  items!: LockedHandoverDto[];

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  nextCursor!: string | null;
}

export class UnlockResultDto {
  @ApiProperty({ format: 'uuid' })
  sellerOrderId!: string;

  @ApiProperty()
  unlocked!: boolean;
}
