import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { CursorQueryDto } from '../../common/pagination';

export class NotificationsQueryDto extends CursorQueryDto {}

export class NotificationDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'ORDER_PAID' })
  type!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  body!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'An app path it opens, e.g. /orders/<id>',
  })
  link!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  readAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;
}

export class NotificationPageDto {
  @ApiProperty({ type: [NotificationDto] })
  items!: NotificationDto[];

  @ApiProperty({ type: String, nullable: true })
  nextCursor!: string | null;
}

export class UnreadCountDto {
  @ApiProperty()
  count!: number;
}

export class MarkReadDto {
  @ApiProperty({
    required: false,
    type: [String],
    description: 'Mark these read; leave out to mark everything read',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  ids?: string[];
}

export class MarkedDto {
  @ApiProperty({ description: 'How many were marked read' })
  count!: number;
}

export class NotificationPrefsDto {
  @ApiProperty({
    description:
      'Order and payment updates also by email (T7). Everything else is in the app only.',
  })
  @IsBoolean()
  orderEmails!: boolean;
}
