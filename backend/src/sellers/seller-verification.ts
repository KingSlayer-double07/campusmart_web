import { ForbiddenException } from '@nestjs/common';
import { VerificationStatus } from '../generated/prisma/enums';
import { hasDeliveryDetails, type DeliveryDetails } from './seller-delivery';

// Product rules: a seller can save drafts straight away, but a listing only goes live once an
// admin has verified the seller's student ID (decided 2026-10-09, guide 9.2.5) and the seller has
// said where riders collect from (decision SA1).
export function assertCanPublish(
  seller: { verificationStatus: VerificationStatus },
  delivery: Omit<DeliveryDetails, 'allowsPickup'> | null,
): void {
  if (seller.verificationStatus !== VerificationStatus.VERIFIED) {
    throw new ForbiddenException({
      code: 'SELLER_NOT_VERIFIED',
      message:
        'An admin needs to verify your student ID before your products can go live. You can save drafts in the meantime.',
    });
  }
  if (!hasDeliveryDetails(delivery)) {
    throw new ForbiddenException({
      code: 'SELLER_PROFILE_INCOMPLETE',
      message:
        'Add your pickup area, address and phone number to your store profile before your products can go live. Riders collect from there. You can save drafts in the meantime.',
    });
  }
}
