'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/app/store/useAuthStore';
import { ApiError } from '@/lib/api/client';
import { useGuestCartMerge } from '@/lib/api/hooks/useGuestCartMerge';
import { useMe } from '@/lib/api/hooks/useMe';

// Refreshes the persisted user from GET /auth/me on every app start (guide 1.6.1-2).
// Only a 401 signs the user out; network errors keep them signed in so the PWA works offline.
// After sign-in it also merges this device's guest cart into the account's (guide 4.3.1).
export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const setUser = useAuthStore((s) => s.setUser);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const { data, error, isPlaceholderData } = useMe();
  useGuestCartMerge();

  useEffect(() => {
    if (data && !isPlaceholderData) setUser(data);
  }, [data, isPlaceholderData, setUser]);

  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) clearAuth();
  }, [error, clearAuth]);

  return <>{children}</>;
}
