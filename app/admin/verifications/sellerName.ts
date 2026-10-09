import type { AdminVerificationRequest } from "@/lib/api/admin";

type Seller = AdminVerificationRequest["seller"];

// The name on the account ("Amaka Obi"), or null when the seller never gave one
export function accountName(seller: Seller): string | null {
  return [seller.firstName, seller.lastName].filter(Boolean).join(" ").trim() || null;
}

// What to call the seller in a list or a toast: their name, else their store, else their email
export function sellerName(seller: Seller): string {
  return accountName(seller) ?? seller.storeName ?? seller.email;
}
