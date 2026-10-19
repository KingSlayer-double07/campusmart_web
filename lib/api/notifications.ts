import { toParams } from './admin';
import { fetchApi } from './client';
import type { components } from './schema';

// Generated from the API's OpenAPI document (D5)
type Schemas = components['schemas'];
export type AppNotification = Schemas['NotificationDto'];
export type NotificationPage = Schemas['NotificationPageDto'];
export type NotificationPrefs = Schemas['NotificationPrefsDto'];

const json = (method: 'POST' | 'PATCH', body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

// Guide 10: the bell, the list and the email preferences (T7)
export const notificationsApi = {
  list: (cursor?: string) => fetchApi<NotificationPage>('/notifications', { params: toParams({ cursor }) }),
  unreadCount: () => fetchApi<{ count: number }>('/notifications/unread-count'),
  markRead: (ids?: string[]) => fetchApi<{ count: number }>('/notifications/read', json('POST', ids ? { ids } : {})),
  prefs: () => fetchApi<NotificationPrefs>('/users/me/notification-preferences'),
  setPrefs: (prefs: NotificationPrefs) => fetchApi<NotificationPrefs>('/users/me/notification-preferences', json('PATCH', prefs)),
};
