import { randomInt } from 'crypto';

// Guide 4.2 step 5: no 0, O, 1 or I, so a code read aloud at the station can't be misheard
export const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

// 'CM-7F3K2Q', printed on the parcel and entered by the agent at drop-off
export function sellerOrderCode(random = randomInt): string {
  let code = '';
  for (let i = 0; i < 6; i += 1)
    code += CODE_ALPHABET[random(CODE_ALPHABET.length)];
  return `CM-${code}`;
}

// The buyer's handover code: 3 digits for every store, so a rider typing several isn't worn out
// (DF10, DF10a). 5 wrong tries lock it (F5), so a guesser gets through about 1 time in 200.
export function collectionCode(random = randomInt): string {
  return String(random(1_000)).padStart(3, '0');
}

// floor(subtotal * PLATFORM_FEE_BPS / 10000), and what's left for the seller
export function splitFee(subtotalKobo: number, feeBps: number) {
  const platformFeeKobo = Math.floor((subtotalKobo * feeBps) / 10_000);
  return { platformFeeKobo, sellerPayoutKobo: subtotalKobo - platformFeeKobo };
}
