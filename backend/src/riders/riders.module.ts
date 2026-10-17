import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { SessionsModule } from '../sessions/sessions.module';
import { AdminRidersController } from './admin-riders.controller';
import { RidersService } from './riders.service';

@Module({
  imports: [MailModule, SessionsModule],
  providers: [RidersService],
  controllers: [AdminRidersController],
  exports: [RidersService],
})
export class RidersModule {}
