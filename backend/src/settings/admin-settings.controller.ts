import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '../admin/admin.guards';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApiOkEnvelope } from '../common/swagger/api-envelope.decorator';
import { SettingsDto, UpdateSettingsDto } from '../payments/dto/payments.dto';
import { SettingsService } from './settings.service';

// Decision R1a: platform-wide numbers an admin can change. Delivery fees live on each institution.
@ApiTags('Admin')
@AdminOnly()
@Controller('admin/settings')
export class AdminSettingsController {
  constructor(private readonly settings: SettingsService) {}

  @ApiOperation({ summary: 'Current settings' })
  @ApiOkEnvelope(SettingsDto)
  @Get()
  get(): Promise<SettingsDto> {
    return this.settings.all();
  }

  @ApiOperation({
    summary: 'Change settings',
    description:
      'Each change is audited with the old and new value. New orders use them straight away.',
  })
  @ApiOkEnvelope(SettingsDto)
  @Patch()
  update(
    @Body() dto: UpdateSettingsDto,
    @CurrentUser() admin: AuthUser,
  ): Promise<SettingsDto> {
    return this.settings.update(dto, admin.id);
  }
}
