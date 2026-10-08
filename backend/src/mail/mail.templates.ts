export interface MailTemplates {
  'verify-email': { code: string; minutes: number };
  'reset-password': { code: string; minutes: number };
}

export type MailTemplate = keyof MailTemplates;

export interface RenderedMail {
  subject: string;
  text: string;
  html: string;
}

const codeHtml = (intro: string, code: string, outro: string) => `
  <p>${intro}</p>
  <p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p>
  <p>${outro}</p>
`;

export const renderers: {
  [K in MailTemplate]: (vars: MailTemplates[K]) => RenderedMail;
} = {
  'verify-email': ({ code, minutes }) => ({
    subject: 'Your CampusMart verification code',
    text:
      `Your CampusMart verification code is ${code}.\n\n` +
      `It expires in ${minutes} minutes. If you didn't create an account, you can ignore this email.`,
    html: codeHtml(
      'Your CampusMart verification code is:',
      code,
      `It expires in ${minutes} minutes. If you didn't create an account, you can ignore this email.`,
    ),
  }),
  'reset-password': ({ code, minutes }) => ({
    subject: 'Reset your CampusMart password',
    text:
      `Your CampusMart password reset code is ${code}.\n\n` +
      `It expires in ${minutes} minutes. If you didn't ask to reset your password, you can ignore this email.`,
    html: codeHtml(
      'Your CampusMart password reset code is:',
      code,
      `It expires in ${minutes} minutes. If you didn't ask to reset your password, you can ignore this email.`,
    ),
  }),
};
