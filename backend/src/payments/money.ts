const naira = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 2 });

// ₦4,500 in notification and email text (the app formats amounts itself)
export const formatNairaPlain = (kobo: number) =>
  `₦${naira.format(kobo / 100)}`;
