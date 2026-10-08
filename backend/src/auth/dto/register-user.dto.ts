import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export type AccountType = 'BUYER' | 'SELLER';

export class RegisterUserDto {
  @ApiProperty({
    description: 'Email address for the new account',
    type: String,
    example: 'user@example.com'
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email!: string;

  @ApiProperty({
    description: 'Password for the new account (min 8 characters)',
    type: String,
    example: 'strongpassword123'
  })
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  password!: string;

  @ApiProperty({
    description: 'First name of the user',
    type: String,
    example: 'Chinedu'
  })
  @IsString()
  @IsNotEmpty({ message: 'First name is required' })
  firstName!: string;

  @ApiProperty({
    description: 'Last name of the user',
    type: String,
    example: 'Musa'
  })
  @IsString()
  @IsNotEmpty({ message: 'Last name is required' })
  lastName!: string;

  @ApiProperty({
    description: 'The account type of the user',
    type: String,
    enum: ['BUYER', 'SELLER'],
    example: 'BUYER'
  })
  @IsIn(['BUYER', 'SELLER'], { message: 'Account type must be either BUYER or SELLER' })
  @IsNotEmpty({ message: 'Account Type is required' })
  role!: AccountType;

  @ApiPropertyOptional({
    description: 'UUID of the institution the user belongs to',
    type: String,
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  @IsUUID('4', { message: 'institutionId must be a valid UUID' })
  @IsOptional()
  institutionId?: string;
}