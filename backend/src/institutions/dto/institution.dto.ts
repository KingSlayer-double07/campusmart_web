import { ApiProperty } from '@nestjs/swagger';

export class InstitutionDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'University of Lagos' })
  name!: string;

  @ApiProperty({ type: [String], example: ['unilag.edu.ng'] })
  domains!: string[];

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}
