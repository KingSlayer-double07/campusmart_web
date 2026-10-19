import { Global, Module } from '@nestjs/common';
import { AdminSettingsController } from './admin-settings.controller';
import { BannedWordsService } from './banned-words.service';
import { SettingsService } from './settings.service';

@Global()
@Module({
  controllers: [AdminSettingsController],
  providers: [SettingsService, BannedWordsService],
  exports: [SettingsService, BannedWordsService],
})
export class SettingsModule {}
