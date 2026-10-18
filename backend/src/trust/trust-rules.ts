// Guide 8.4 with decisions R1 and R2: a seller's trust score, 0 to 100, recalculated nightly
// with the weights in settings. Buyers see only a "Trusted seller" badge at 80 or more.

export const TRUSTED_AT = 80;
export const RECENT_ORDERS = 50;
export const FAULT_DAYS = 90;

export interface TrustWeights {
  rating: number; // for a 5-star average
  completed: number; // when every recent settled order was handed over
  verified: number;
  penalty: number; // per seller-fault cancellation or refund
}

export interface TrustInput {
  ratingAvg: number;
  completed: number; // delivered or collected, of the last 50 settled orders
  settled: number; // delivered, collected or cancelled after payment
  verified: boolean;
  sellerFaults: number; // in the last 90 days
}

export function trustScore(input: TrustInput, w: TrustWeights): number {
  const share = input.settled ? input.completed / input.settled : 0;
  const raw =
    w.rating * (input.ratingAvg / 5) +
    w.completed * share +
    (input.verified ? w.verified : 0) -
    w.penalty * input.sellerFaults;
  return Math.round(Math.min(100, Math.max(0, raw)) * 10) / 10;
}

export const isTrusted = (score: number) => score >= TRUSTED_AT;
