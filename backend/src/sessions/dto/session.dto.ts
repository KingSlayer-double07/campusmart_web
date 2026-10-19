import { ApiProperty } from '@nestjs/swagger';

export class SessionDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Mozilla/5.0 (iPhone; …)',
  })
  userAgent!: string | null;

  @ApiProperty({ type: String, nullable: true, example: '102.89.1.10' })
  ipAddress!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  lastUsedAt!: Date;

  @ApiProperty({ description: 'True for the session making this request' })
  current!: boolean;
}
