// Mirrors the API's SetPayoutAccountDto: a 10-digit NUBAN and a bank from Paystack's list
export function accountNumberError(accountNumber: string): string | null {
  const value = accountNumber.replace(/\s/g, "");
  if (!value) return "Enter your 10-digit account number";
  return /^\d{10}$/.test(value) ? null : "Enter your 10-digit account number";
}
