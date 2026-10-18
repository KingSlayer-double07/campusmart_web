export interface MailTemplates {
  'verify-email': { code: string; minutes: number };
  'reset-password': { code: string; minutes: number };
  // Decision M7: a code at every admin sign-in
  'admin-sign-in': { code: string; minutes: number };
  // Order, payment and admin alerts (decisions T7, P10): the in-app notification, by email
  notification: { title: string; body: string; link: string | null };
  // Decision DX1: an admin invites a rider; the link sets their password
  'rider-invite': {
    firstName: string | null;
    institution: string;
    link: string;
    days: number;
  };
}

export type MailTemplate = keyof MailTemplates;

export interface RenderedMail {
  subject: string;
  text: string;
  html: string;
}

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );

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
  'admin-sign-in': ({ code, minutes }) => ({
    subject: 'Your CampusMart admin sign-in code',
    text:
      `Your CampusMart admin sign-in code is ${code}.\n\n` +
      `It expires in ${minutes} minutes. If you didn't just sign in, change your password now: someone else knows it.`,
    html: codeHtml(
      'Your CampusMart admin sign-in code is:',
      code,
      `It expires in ${minutes} minutes. If you didn't just sign in, change your password now: someone else knows it.`,
    ),
  }),
  'rider-invite': ({ firstName, institution, link, days }) => {
    const hello = firstName ? `Hi ${firstName},` : 'Hi,';
    const intro = `You've been invited to deliver CampusMart orders at ${institution}.`;
    const outro = `The link works for ${days} days. If you weren't expecting this, you can ignore this email.`;
    return {
      subject: 'Your CampusMart rider invitation',
      text: `${hello}\n\n${intro} Set your password here:\n${link}\n\n${outro}`,
      html:
        `<p>${escapeHtml(hello)}</p><p>${escapeHtml(intro)}</p>` +
        `<p><a href="${escapeHtml(link)}">Set your password</a></p><p>${escapeHtml(outro)}</p>`,
    };
  },
  notification: ({ title, body, link }) => ({
    subject: title,
    text: link ? `${body}\n\n${link}` : body,
    html:
      `<p><strong>${escapeHtml(title)}</strong></p><p>${escapeHtml(body)}</p>` +
      (link ? `<p><a href="${escapeHtml(link)}">Open CampusMart</a></p>` : ''),
  }),
};
