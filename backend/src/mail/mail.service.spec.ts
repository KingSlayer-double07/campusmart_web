import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';
import { MailService } from './mail.service';

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

function serviceFor(env: Record<string, unknown>) {
  const config = {
    get: (key: string) => env[key],
  } as unknown as ConfigService<any, true>;
  return new MailService(config);
}

describe('MailService', () => {
  const sendMail = jest.fn();

  beforeEach(() => {
    jest.mocked(createTransport).mockReturnValue({ sendMail } as any);
    sendMail.mockReset();
  });

  afterEach(() => jest.restoreAllMocks());

  it('prints to the console in development instead of sending', async () => {
    const log = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    await serviceFor({ NODE_ENV: 'development' }).send(
      'ada@unilag.edu.ng',
      'verify-email',
      { code: '123456', minutes: 10 },
    );
    expect(sendMail).not.toHaveBeenCalled();
    expect(String(log.mock.calls[0][0])).toContain('123456');
  });

  it('sends over SMTP in production', async () => {
    await serviceFor({
      NODE_ENV: 'production',
      MAIL_HOST: 'smtp.example.com',
      MAIL_PORT: 587,
      MAIL_USER: 'u',
      MAIL_PASS: 'p',
      MAIL_FROM: 'CampusMart <noreply@example.com>',
    }).send('ada@unilag.edu.ng', 'reset-password', {
      code: '654321',
      minutes: 10,
    });
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'smtp.example.com', port: 587 }),
    );
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'ada@unilag.edu.ng',
        from: 'CampusMart <noreply@example.com>',
        subject: 'Reset your CampusMart password',
        text: expect.stringContaining('654321'),
      }),
    );
  });
});
