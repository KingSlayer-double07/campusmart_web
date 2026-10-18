import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads/uploads.module';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';

// Guide 10: Help → report a problem, email support and call us
@Module({
  imports: [UploadsModule],
  controllers: [SupportController],
  providers: [SupportService],
})
export class SupportModule {}
