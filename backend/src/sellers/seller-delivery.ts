import type { Prisma } from '../generated/prisma/client';

// Where riders collect a seller's parcels, and buyers collect when the seller allows it
export const deliveryDetailsSelect = {
  pickupArea: true,
  pickupAddress: true,
  contactPhone: true,
  allowsPickup: true,
} satisfies Prisma.SellerProfileSelect;

export type DeliveryDetails = Prisma.SellerProfileGetPayload<{
  select: typeof deliveryDetailsSelect;
}>;

// Decision SA1: riders collect from every seller, so publishing needs an area, address and phone
export function hasDeliveryDetails(
  details: Omit<DeliveryDetails, 'allowsPickup'> | null | undefined,
): boolean {
  return !!(
    details?.pickupArea &&
    details.pickupAddress &&
    details.contactPhone
  );
}

// Decision DL1: a buyer can collect only from a seller who allows it and has entered the details
export function offersPickup(
  details: DeliveryDetails | null | undefined,
): boolean {
  return !!details?.allowsPickup && hasDeliveryDetails(details);
}
