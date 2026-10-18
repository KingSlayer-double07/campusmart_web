import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InstitutionsModule } from '../institutions/institutions.module';
import { MailModule } from '../mail/mail.module';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';

// Phase 10: the signed-in user's own account beyond sign-in (school, selling, and later deletion)
@Module({
  imports: [AuthModule, InstitutionsModule, MailModule],
  controllers: [AccountController],
  providers: [AccountService],
})
export class AccountModule {}
