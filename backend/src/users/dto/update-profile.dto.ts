import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateProfileDto {
    @ApiPropertyOptional({
        description: 'First name of the user',
        type: String,
        example: 'John'
    })
    @IsString({ message: 'First name must be a string' })
    @IsOptional()
    firstName?: string;
    
    @ApiPropertyOptional({
        description: 'Last name of the user',
        type: String,
        example: 'Doe'
    })
    @IsString({ message: 'Last name must be a string' })
    @IsOptional()
    lastName?: string;

    @ApiPropertyOptional({
        description: 'Institution ID to which the user belongs',
        type: String,
        example: 'uuid-of-institution'
    })
    @IsUUID('all', { message: 'institutionId must be a valid UUID' })
    @IsOptional()
    institutionId?: string;

    @ApiPropertyOptional({
        description: 'Email address of the user',
        type: String,
        example: 'user@example.com'
    })
    @IsString({ message: 'Email must be a string' })
    @IsEmail({}, { message: 'Email must be a valid email address' })
    @IsOptional()
    email?: string;
}