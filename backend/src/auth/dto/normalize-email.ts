import { Transform } from 'class-transformer';

// Emails are compared lowercased and trimmed everywhere
export const NormalizeEmail = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  );
