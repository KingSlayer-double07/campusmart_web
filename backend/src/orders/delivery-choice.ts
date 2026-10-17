import { BadRequestException, ConflictException } from '@nestjs/common';
import { DeliveryMethod } from '../generated/prisma/enums';

export interface CartStore {
  sellerId: string;
  storeName: string;
  offersPickup: boolean;
}

// Decision DM1: every store in the cart gets one method, and pickup only from a seller who
// offers it (DL1). A choice for a store that's no longer in the cart is ignored; the cart page
// catches up when it refetches.
export function chooseMethods(
  stores: CartStore[],
  choices: { sellerId: string; method: DeliveryMethod }[],
): Map<string, DeliveryMethod> {
  const chosen = new Map<string, DeliveryMethod>();
  for (const choice of choices) {
    if (chosen.has(choice.sellerId)) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Choose one delivery method per store',
      });
    }
    chosen.set(choice.sellerId, choice.method);
  }

  const methods = new Map<string, DeliveryMethod>();
  for (const store of stores) {
    const method = chosen.get(store.sellerId);
    if (!method) {
      throw new BadRequestException({
        code: 'DELIVERY_CHOICE_REQUIRED',
        message: `Choose delivery or pickup for ${store.storeName}`,
        details: { sellerId: store.sellerId },
      });
    }
    if (method === DeliveryMethod.SELLER_PICKUP && !store.offersPickup) {
      throw new ConflictException({
        code: 'PICKUP_NOT_OFFERED',
        message: `${store.storeName} doesn't offer pickup. Choose delivery for their items.`,
        details: { sellerId: store.sellerId },
      });
    }
    methods.set(store.sellerId, method);
  }
  return methods;
}

// Decision DF6: everything that goes by dispatch shares one destination, either a campus place or
// an address off campus
export function assertOneDestination(destination?: {
  campusPlaceId?: string;
  address?: string;
}): void {
  const place = !!destination?.campusPlaceId;
  const address = !!destination?.address;
  if (place && address) {
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: 'Choose a place on campus or an address off campus, not both',
    });
  }
  if (!place && !address) {
    throw new BadRequestException({
      code: 'DESTINATION_REQUIRED',
      message:
        'Choose where the rider brings your order: a place on campus, or an address off campus',
    });
  }
}
