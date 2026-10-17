import { createHash, randomBytes } from 'crypto';

// Decision DX1: the invite link carries a random token; only its hash is stored
export const INVITE_DAYS = 7;

export function newInviteToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: inviteTokenHash(token) };
}

export const inviteTokenHash = (token: string) =>
  createHash('sha256').update(token).digest('hex');
