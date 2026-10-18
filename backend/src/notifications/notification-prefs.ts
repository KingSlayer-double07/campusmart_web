import type { Prisma } from '../generated/prisma/client';

// Guide 10 and decision T7: everything shows in the app; only order and payment events also go by
// email, and a user can turn those emails off. Admin alerts (P10) always go.
export interface NotificationPrefs {
  orderEmails: boolean;
}

export const DEFAULT_PREFS: NotificationPrefs = { orderEmails: true };

export function readPrefs(
  value: Prisma.JsonValue | null | undefined,
): NotificationPrefs {
  const stored =
    value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    orderEmails:
      typeof stored.orderEmails === 'boolean'
        ? stored.orderEmails
        : DEFAULT_PREFS.orderEmails,
  };
}
