import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiOkEnvelope } from '../common/swagger/api-envelope.decorator';
import { ErrorResponseDto } from '../common/swagger/error-response.dto';
import { PrismaService } from '../prisma/prisma.service';
import { HealthDto } from './health.dto';

// The database must answer within this, or the API reports itself unhealthy
const DB_TIMEOUT_MS = 3000;

@ApiTags('System')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
  ) {}

  @ApiOperation({
    summary: 'Health check for the host and uptime monitoring',
    description:
      'Public. 200 when the API can reach the database, 503 UNHEALTHY when it can’t.',
  })
  @ApiOkEnvelope(HealthDto)
  @ApiResponse({
    status: 503,
    type: ErrorResponseDto,
    description: 'UNHEALTHY: the database did not answer',
  })
  @SkipThrottle() // the host and the monitor poll it
  @HealthCheck({ noCache: true, swaggerDocumentation: false })
  @Get()
  async check(): Promise<HealthDto> {
    try {
      await this.health.check([
        () =>
          this.db.pingCheck('database', this.prisma, {
            timeout: DB_TIMEOUT_MS,
          }),
      ]);
    } catch {
      // Terminus's own body carries the driver's message; only the verdict goes out
      throw new ServiceUnavailableException({
        code: 'UNHEALTHY',
        message: 'The database is unreachable',
        details: { database: 'down' },
      });
    }
    return { status: 'ok', checks: { database: 'up' } };
  }
}
