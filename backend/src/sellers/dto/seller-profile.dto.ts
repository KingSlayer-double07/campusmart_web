import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { PHONE_MESSAGE, PHONE_RE } from '../../common/phone';
import { Trim } from '../../common/transforms';

// The seller's own store profile. Never includes the Paystack recipient code.
export class SellerProfileDto {
  @ApiProperty({ type: String, nullable: true })
  storeName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  bio!: string | null;

  @ApiProperty({ type: String, nullable: true })
  logoUrl!: string | null;

  @ApiProperty({ description: 'Shown to buyers as "Online"' })
  isOnline!: boolean;

  @ApiProperty()
  ratingAvg!: number;

  @ApiProperty()
  ratingCount!: number;

  @ApiProperty({ type: String, nullable: true })
  payoutBankName!: string | null;

  @ApiProperty({ type: String, nullable: true, example: '6789' })
  payoutAccountLast4!: string | null;

  @ApiProperty({ type: String, nullable: true })
  payoutAccountName!: string | null;

  @ApiProperty({ description: 'A payout account is set up (Phase 5)' })
  hasPayoutAccount!: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Moremi Hall',
    description: 'Buyers see this before paying (decision SA2)',
  })
  pickupArea!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Where riders collect. A buyer who picks up sees it only after paying (decision SA3).',
  })
  pickupAddress!: string | null;

  @ApiProperty({ type: String, nullable: true, example: '+234 801 234 5678' })
  contactPhone!: string | null;

  @ApiProperty({
    description: 'Buyers may choose to collect from you (decision DL1)',
  })
  allowsPickup!: boolean;

  @ApiProperty({
    description:
      'The area, address and phone are all set. Publishing needs them (decision SA1).',
  })
  deliveryDetailsComplete!: boolean;
}

export class UpdateSellerProfileDto {
  @ApiPropertyOptional({ minLength: 2, maxLength: 60, example: 'TrendHUB NG' })
  @IsOptional()
  @Trim()
  @IsString()
  @Length(2, 60, { message: 'The store name must be 2 to 60 characters' })
  storeName?: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 500 })
  @IsOptional()
  @ValidateIf((dto: UpdateSellerProfileDto) => dto.bio !== null)
  @Trim()
  @IsString()
  @MaxLength(500, { message: 'The bio can be up to 500 characters' })
  bio?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Uploaded with an AVATAR signature; null removes it',
  })
  @IsOptional()
  @ValidateIf((dto: UpdateSellerProfileDto) => dto.logoUrl !== null)
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(500)
  logoUrl?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isOnline?: boolean;

  @ApiPropertyOptional({ minLength: 2, maxLength: 80, example: 'Moremi Hall' })
  @IsOptional()
  @Trim()
  @IsString()
  @Length(2, 80, { message: 'The area must be 2 to 80 characters' })
  pickupArea?: string;

  @ApiPropertyOptional({
    minLength: 5,
    maxLength: 300,
    example: 'Room 12, Block B, Moremi Hall',
  })
  @IsOptional()
  @Trim()
  @IsString()
  @Length(5, 300, { message: 'The address must be 5 to 300 characters' })
  pickupAddress?: string;

  @ApiPropertyOptional({ example: '+234 801 234 5678' })
  @IsOptional()
  @Trim()
  @IsString()
  @Matches(PHONE_RE, { message: PHONE_MESSAGE })
  contactPhone?: string;

  @ApiPropertyOptional({
    description: 'Needs the area, address and phone to be set',
  })
  @IsOptional()
  @IsBoolean()
  allowsPickup?: boolean;
}
