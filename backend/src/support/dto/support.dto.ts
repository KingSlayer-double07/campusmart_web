import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  MaxLength,
} from 'class-validator';
import { Trim } from '../../common/transforms';

// A listing is reported from its own page (Phase 9); these are the rest
export const SUPPORT_TYPES = ['BUG', 'ORDER', 'PAYMENT', 'OTHER'] as const;
export type SupportType = (typeof SUPPORT_TYPES)[number];

export class CreateSupportReportDto {
  @ApiProperty({ enum: SUPPORT_TYPES, enumName: 'SupportType' })
  @IsIn(SUPPORT_TYPES, { message: 'Choose what it’s about' })
  type!: SupportType;

  @ApiProperty({
    minLength: 10,
    maxLength: 2000,
    description: 'What happened; an order code helps',
  })
  @Trim()
  @IsString()
  @Length(10, 2000, {
    message: 'Tell us what happened in 10 to 2000 characters',
  })
  message!: string;

  @ApiPropertyOptional({
    description: 'A screenshot uploaded with purpose SUPPORT (guide 3.1)',
  })
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(500)
  screenshotUrl?: string;
}

export class SupportReceiptDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
}

export class SupportContactsDto {
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Null shows "coming soon" (T4)',
  })
  email!: string | null;

  @ApiProperty({ type: String, nullable: true })
  phone!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'A WhatsApp number',
  })
  whatsapp!: string | null;
}
