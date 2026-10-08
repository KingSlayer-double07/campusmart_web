import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../generated/prisma/enums';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsStrongPassword
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty({
    description: 'Email address of the user',
    type: String,
    example: 'user@example.com'
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email!: string;

  @ApiProperty({
    description: 'Password for the user',
    type: String,
    example: 'SecurePass123'
  })
  @IsStrongPassword({
    minLength: 8,
    minLowercase: 1,
    minUppercase: 1,
    minNumbers: 1,
    minSymbols: 0
  }, { message: 'New password must be strong (at least 8 characters, including uppercase, lowercase, number, and symbol)' })
  password!: string;

  @ApiProperty({
    description: 'First name of the user',
    type: String,
    example: 'John'
  })
  @IsString()
  @IsNotEmpty({ message: 'First name is required' })
  firstName!: string;

  @ApiProperty({
    description: 'Last name of the user',
    type: String,
    example: 'Doe'
  })
  @IsString()
  @IsNotEmpty({ message: 'Last name is required' })
  lastName!: string;

  @ApiProperty({
    description: 'Role of the user',
    type: String,
    example: 'BUYER',
    enum: UserRole,
  })
  @IsEnum(UserRole, { message: `Role must be one of: ${Object.values(UserRole).join(', ')}` })
  role!: UserRole;

  @ApiProperty({
    description: 'Institution ID to which the user belongs',
    type: String,
    example: 'uuid-of-institution'
  })
  @IsUUID('all', { message: 'institutionId must be a valid UUID' })
  @IsOptional()
  institutionId?: string;
}