import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import { mailTransport, type Env } from '../config/env';
import { MailTemplate, MailTemplates, renderers } from './mail.templates';

// D18: nodemailer over SMTP. Outside production emails print to the console instead, so local
// sign-up works without SMTP and the Playwright smoke test can read codes from the log.
// MAIL_TRANSPORT=console does the same on a production server, for a staging server that can't
// send email yet (asked for on 2026-10-19: Render's free instance type blocks SMTP).
@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter?: Transporter;
  private readonly production: boolean;
  private readonly toConsole: boolean;

  constructor(private readonly config: ConfigService<Env, true>) {
    this.production = config.get('NODE_ENV', { infer: true }) === 'production';
    this.toConsole =
      mailTransport({
        NODE_ENV: config.get('NODE_ENV', { infer: true }),
        MAIL_TRANSPORT: config.get('MAIL_TRANSPORT', { infer: true }),
      }) === 'console';
  }

  onModuleInit() {
    if (this.production && this.toConsole) {
      this.logger.warn(
        'MAIL_TRANSPORT=console: emails, sign-in codes included, are printed to this log and not sent. Remove it before launch.',
      );
    }
  }

  async send<K extends MailTemplate>(
    to: string,
    template: K,
    vars: MailTemplates[K],
  ): Promise<void> {
    const mail = renderers[template](vars);

    if (this.toConsole) {
      const line = `[dev mail] to=${to} template=${template} subject="${mail.subject}"\n${mail.text}`;
      // A production server only prints warnings and errors (main.ts)
      if (this.production) this.logger.warn(line);
      else this.logger.log(line);
      return;
    }

    await this.getTransporter().sendMail({
      from: this.config.get('MAIL_FROM', { infer: true }),
      to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
  }

  private getTransporter() {
    if (!this.transporter) {
      const port = this.config.get('MAIL_PORT', { infer: true }) ?? 587;
      this.transporter = createTransport({
        host: this.config.get('MAIL_HOST', { infer: true }),
        port,
        secure: port === 465,
        auth: {
          user: this.config.get('MAIL_USER', { infer: true }),
          pass: this.config.get('MAIL_PASS', { infer: true }),
        },
      });
    }
    return this.transporter;
  }
}
