import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsOptional, IsString, Matches } from 'class-validator';

export class CreateInstitutionDto {
  @ApiProperty({
    description: 'Name of the institution',
    example: 'University of Example',
  })
  @IsString({ message: 'Name must be a string' })
  name!: string;

  @ApiPropertyOptional({
    description:
      'Email domains for the institution, e.g. student and staff addresses',
    example: ['example.edu', 'students.example.edu'],
    type: [String],
  })
  @IsOptional()
  @ArrayMaxSize(20)
  @Matches(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/, {
    each: true,
    message: 'Each domain must be a lowercase domain such as example.edu',
  })
  domains?: string[];
}
