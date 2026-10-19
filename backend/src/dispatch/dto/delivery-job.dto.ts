import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsDate,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CursorQueryDto } from '../../common/pagination';
import { Trim } from '../../common/transforms';
import {
  DeliveryJobStatus,
  FulfillmentStatus,
} from '../../generated/prisma/enums';

export class JobItemDto {
  @ApiProperty()
  title!: string;

  @ApiProperty({ type: String, nullable: true })
  variantLabel!: string | null;

  @ApiProperty()
  quantity!: number;
}

// One store on the job. Before a rider accepts, only the area and the item count show (C6).
export class JobStopDto {
  @ApiProperty({ format: 'uuid' })
  sellerOrderId!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'After you accept',
  })
  storeName!: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'Moremi Hall' })
  area!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'After you accept',
  })
  address!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'After you accept',
  })
  phone!: string | null;

  @ApiProperty()
  itemCount!: number;

  @ApiProperty({ type: [JobItemDto], description: 'After you accept' })
  items!: JobItemDto[];

  @ApiProperty({ enum: FulfillmentStatus, enumName: 'FulfillmentStatus' })
  status!: FulfillmentStatus;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  arrivalFrom!: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  arrivalTo!: Date | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Collect from the store by then (DL7b)',
  })
  pickupDeadline!: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  pickedUpAt!: Date | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'You reported the store not ready (DF11)',
  })
  notReadyAt!: Date | null;

  @ApiProperty({ type: String, nullable: true })
  notReadyNote!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  deliveredAt!: Date | null;

  @ApiProperty({ description: '5 wrong buyer codes (F5)' })
  handoverLocked!: boolean;
}

export class JobDestinationDto {
  @ApiProperty({ description: 'Off campus: the fee is settled with the buyer' })
  offCampus!: boolean;

  @ApiProperty({ type: String, nullable: true, example: 'Faculty of Science' })
  campusPlace!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Off campus, after you accept',
  })
  address!: string | null;
}

export class JobBuyerDto {
  @ApiProperty({ description: 'Their username or first name' })
  name!: string;

  @ApiProperty({ type: String, nullable: true })
  phone!: string | null;
}

export class DeliveryJobDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: DeliveryJobStatus, enumName: 'DeliveryJobStatus' })
  status!: DeliveryJobStatus;

  @ApiProperty({ description: 'You hold this job' })
  mine!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  acceptedAt!: Date | null;

  @ApiProperty({ description: 'The order’s on-campus delivery fee, in kobo' })
  deliveryFeeKobo!: number;

  @ApiProperty({ type: JobDestinationDto })
  destination!: JobDestinationDto;

  @ApiProperty({
    type: JobBuyerDto,
    nullable: true,
    description: 'After you accept (C6)',
  })
  buyer!: JobBuyerDto | null;

  @ApiProperty({ type: [JobStopDto] })
  stops!: JobStopDto[];
}

export class DeliveryJobPageDto {
  @ApiProperty({ type: [DeliveryJobDto] })
  items!: DeliveryJobDto[];

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  nextCursor!: string | null;
}

export const JOB_SCOPES = ['OPEN', 'MINE', 'DONE'] as const;
export type JobScope = (typeof JOB_SCOPES)[number];

export class ListJobsQueryDto extends CursorQueryDto {
  @ApiPropertyOptional({
    enum: JOB_SCOPES,
    enumName: 'JobScope',
    default: 'OPEN',
    description:
      'OPEN: waiting for a rider at your campus; MINE: yours in progress; DONE: yours finished',
  })
  @IsOptional()
  @IsIn(JOB_SCOPES)
  scope: JobScope = 'OPEN';
}

export class ArrivalTimesDto {
  @ApiProperty({ type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate({ message: 'Choose when you will arrive' })
  from!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate({ message: 'Choose when you will arrive' })
  to!: Date;
}

export class ArrivalWindowDto extends ArrivalTimesDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  sellerOrderId!: string;
}

// Decision DF8b: when accepting, the rider says when they'll reach each store
export class AcceptJobDto {
  @ApiProperty({ type: [ArrivalWindowDto] })
  @ValidateNested({ each: true })
  @Type(() => ArrivalWindowDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  windows!: ArrivalWindowDto[];
}

// Decision DX5: the seller-order code, typed or scanned at the store
export class PickupCodeDto {
  @ApiProperty({ example: 'CM-7F3K2Q' })
  @Trim()
  @IsString()
  @Length(6, 12, { message: "Enter the store's CM- code" })
  code!: string;
}

// Decision DL5: the buyer's code, for one store's order
export class HandoverCodeDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  sellerOrderId!: string;

  @ApiProperty({ example: '048' })
  @Trim()
  @Matches(/^\d{3,6}$/, { message: "Enter the buyer's 3-digit code" })
  code!: string;
}

// Decision DF11: the store wasn't ready, or the seller wasn't there
export class NotReadyDto {
  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class SellerHandoverDto {
  @ApiProperty({ example: '048' })
  @Trim()
  @Matches(/^\d{3,6}$/, { message: "Enter the buyer's 3-digit code" })
  code!: string;
}
