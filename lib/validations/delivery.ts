// Mirrors the API's phone and address rules (backend/src/common/phone.ts, CheckoutDto)
export const PHONE_RE = /^\+?\d[\d ()-]{6,19}$/;
export const PHONE_MESSAGE = "Enter a phone number such as +234 801 234 5678";

export function phoneError(phone: string): string | null {
  const value = phone.trim();
  if (!value) return "Add a phone number so the rider can call you";
  return PHONE_RE.test(value) ? null : PHONE_MESSAGE;
}

export function addressError(address: string): string | null {
  const value = address.trim();
  if (!value) return "Enter the address the rider should bring it to";
  if (value.length < 5 || value.length > 300) return "The address must be 5 to 300 characters";
  return null;
}
