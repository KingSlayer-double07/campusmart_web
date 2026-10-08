import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import type { Env } from '../config/env';
import { InstitutionsModule } from '../institutions/institutions.module';
import { MailModule } from '../mail/mail.module';
import { SessionsModule } from '../sessions/sessions.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailCodesService } from './email-codes.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule,
    SessionsModule,
    MailModule,
    InstitutionsModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_SECRET', { infer: true }),
        signOptions: { expiresIn: '15m' }, // D6
      }),
    }),
  ],
  providers: [AuthService, EmailCodesService, JwtStrategy],
  controllers: [AuthController],
})
export class AuthModule {}
