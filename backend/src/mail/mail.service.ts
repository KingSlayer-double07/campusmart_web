import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import type { Env } from '../config/env';
import { MailTemplate, MailTemplates, renderers } from './mail.templates';

// D18: nodemailer over SMTP. Outside production emails print to the console instead, so local
// sign-up works without SMTP and the Playwright smoke test can read codes from the log.
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter?: Transporter;

  constructor(private readonly config: ConfigService<Env, true>) {}

  async send<K extends MailTemplate>(
    to: string,
    template: K,
    vars: MailTemplates[K],
  ): Promise<void> {
    const mail = renderers[template](vars);

    if (this.config.get('NODE_ENV', { infer: true }) !== 'production') {
      this.logger.log(
        `[dev mail] to=${to} template=${template} subject="${mail.subject}"\n${mail.text}`,
      );
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
