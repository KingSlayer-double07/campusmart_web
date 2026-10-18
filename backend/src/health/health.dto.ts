import { ApiProperty } from '@nestjs/swagger';

export class HealthChecksDto {
  @ApiProperty({ enum: ['up'] })
  database!: 'up';
}

export class HealthDto {
  @ApiProperty({ enum: ['ok'] })
  status!: 'ok';

  @ApiProperty({ type: HealthChecksDto })
  checks!: HealthChecksDto;
}
