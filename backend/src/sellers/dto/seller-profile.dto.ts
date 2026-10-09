import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  MaxLength,
  ValidateIf,
} from 'class-validator';
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
}
