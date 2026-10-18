import { Body, Controller, Get, Patch, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '../admin/admin.guards';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApiOkEnvelope } from '../common/swagger/api-envelope.decorator';
import { SettingsDto, UpdateSettingsDto } from '../payments/dto/payments.dto';
import { BannedWordsService } from './banned-words.service';
import { BannedWordsDto } from './dto/banned-words.dto';
import { SettingsService } from './settings.service';

// Decision R1a: platform-wide numbers an admin can change. Delivery fees live on each institution.
@ApiTags('Admin')
@AdminOnly()
@Controller('admin/settings')
export class AdminSettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly bannedWords: BannedWordsService,
  ) {}

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

  @ApiOperation({
    summary: 'The banned-word list',
    description:
      'A listing using one of these words or phrases waits for an admin before going live (M4a, M4c).',
  })
  @ApiOkEnvelope(BannedWordsDto)
  @Get('banned-words')
  async getBannedWords(): Promise<BannedWordsDto> {
    return { words: await this.bannedWords.list() };
  }

  @ApiOperation({
    summary: 'Replace the banned-word list',
    description:
      'Words are lower-cased and de-duplicated. Audited with what was added and removed. Applies to listings published from now on.',
  })
  @ApiOkEnvelope(BannedWordsDto)
  @Put('banned-words')
  async setBannedWords(
    @Body() dto: BannedWordsDto,
    @CurrentUser() admin: AuthUser,
  ): Promise<BannedWordsDto> {
    return { words: await this.bannedWords.set(dto.words, admin.id) };
  }
}
