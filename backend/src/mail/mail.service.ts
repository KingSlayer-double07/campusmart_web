// TODO(resend): Disabled until we own a domain and can verify it with Resend.
// To enable:
//   1. npm install resend
//   2. Add RESEND_API_KEY and MAIL_FROM to .env (and uncomment them in src/config/env.ts)
//   3. Uncomment this file, mail.module.ts, and the verification code in the auth module
//
// import { Injectable, Logger } from '@nestjs/common';
// import { ConfigService } from '@nestjs/config';
// import { Resend } from 'resend';
//
// @Injectable()
// export class MailService {
//   private readonly logger = new Logger(MailService.name);
//   private readonly resend: Resend;
//   private readonly from: string;
//
//   constructor(configService: ConfigService) {
//     this.resend = new Resend(configService.getOrThrow<string>('RESEND_API_KEY'));
//     this.from = configService.getOrThrow<string>('MAIL_FROM');
//   }
//
//   async sendVerificationCode(to: string, code: string, expiresInMinutes: number) {
//     const { error } = await this.resend.emails.send({
//       from: this.from,
//       to,
//       subject: 'Your CampusMart verification code',
//       text:
//         `Your CampusMart verification code is ${code}.\n\n` +
//         `It expires in ${expiresInMinutes} minutes. If you didn't create an account, you can ignore this email.`,
//       html: `
//         <p>Your CampusMart verification code is:</p>
//         <p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p>
//         <p>It expires in ${expiresInMinutes} minutes. If you didn't create an account, you can ignore this email.</p>
//       `,
//     });
//
//     if (error) {
//       this.logger.error(`Failed to send verification code to ${to}: ${error.message}`);
//       throw new Error(error.message);
//     }
//   }
// }
