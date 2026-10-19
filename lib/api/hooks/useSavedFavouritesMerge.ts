import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/app/store/useAuthStore';
import { wishlistApi } from '../wishlist';
import { wishlistIdsKey, wishlistKey } from './useWishlist';

// Where favourites lived on the phone before Phase 8 (the old zustand store)
export const SAVED_FAVOURITES_KEY = 'campus-mart-favourites';
const MERGE_LIMIT = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readSavedFavourites(): string[] {
  try {
    const raw = localStorage.getItem(SAVED_FAVOURITES_KEY);
    if (!raw) return [];
    const favourites = (JSON.parse(raw) as { state?: { favourites?: { id?: unknown }[] } }).state?.favourites ?? [];
    return [...new Set(favourites.map((f) => String(f.id ?? '')).filter((id) => UUID.test(id)))];
  } catch {
    return [];
  }
}

export function clearSavedFavourites() {
  try {
    localStorage.removeItem(SAVED_FAVOURITES_KEY);
  } catch {
    // Storage blocked: nothing to clear
  }
}

// Decision R5: favourites saved on this phone before sign-in move into the account once, then
// leave the phone. If the merge fails (offline, email not verified) they stay for next time.
export function useSavedFavouritesMerge() {
  const userId = useAuthStore((s) => (s.user?.emailVerifiedAt && s.user.role !== 'DISPATCH' ? s.user.id : null));
  const queryClient = useQueryClient();
  const running = useRef(false);

  useEffect(() => {
    if (!userId || running.current) return;
    const ids = readSavedFavourites();
    if (ids.length === 0) return clearSavedFavourites();

    running.current = true;
    wishlistApi
      .merge(ids.slice(0, MERGE_LIMIT))
      .then((saved) => {
        queryClient.setQueryData(wishlistIdsKey, saved);
        clearSavedFavourites();
        return queryClient.invalidateQueries({ queryKey: wishlistKey });
      })
      .catch(() => undefined)
      .finally(() => {
        running.current = false;
      });
  }, [userId, queryClient]);
}
