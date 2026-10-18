import { Global, Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { InboxService } from './inbox.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Global()
@Module({
  imports: [MailModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, InboxService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
