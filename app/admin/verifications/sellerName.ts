import type { AdminVerificationRequest } from "@/lib/api/admin";

// "Amaka Obi", or the email when the account has no name yet
export function sellerName(seller: AdminVerificationRequest["seller"]) {
  const name = [seller.firstName, seller.lastName].filter(Boolean).join(" ").trim();
  return name || seller.email;
}
