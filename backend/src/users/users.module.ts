import { Module } from '@nestjs/common';
import { SessionsModule } from '../sessions/sessions.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [SessionsModule],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
