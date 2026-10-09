import { ForbiddenException } from '@nestjs/common';
import { VerificationStatus } from '../generated/prisma/enums';

// Product rule (decided 2026-10-09): a seller can save drafts straight away, but a listing only
// goes live once an admin has verified the seller's student ID (guide 9.2.5).
export function assertCanPublish(seller: {
  verificationStatus: VerificationStatus;
}): void {
  if (seller.verificationStatus === VerificationStatus.VERIFIED) return;
  throw new ForbiddenException({
    code: 'SELLER_NOT_VERIFIED',
    message:
      'An admin needs to verify your student ID before your products can go live. You can save drafts in the meantime.',
  });
}
