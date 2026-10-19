import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiOkEnvelope } from './common/swagger/api-envelope.decorator';

@ApiTags('System')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @ApiOperation({
    summary: 'Health Check',
    description: 'Returns a simple message to confirm the API is running',
  })
  @ApiOkEnvelope(String)
  @Get()
  getHello(): string {
    return this.appService.getHealth();
  }
}
