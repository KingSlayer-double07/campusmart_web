import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/app/store/useAuthStore';
import { useCartStore } from '@/app/store/useCartStore';
import { authApi } from '../auth';
import { clearSavedFavourites } from './useSavedFavouritesMerge';

// Guide 1.6.9: call the API, clear every cached query (favourites included), reset the cart store
// and remove its localStorage key, so nothing from this account survives on a shared phone.
export function useLogout() {
  const queryClient = useQueryClient();

  return useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Offline or already signed out: still wipe this device
    }
    queryClient.clear();
    useCartStore.setState({ cart: [] });
    useCartStore.persist.clearStorage();
    clearSavedFavourites();
    useAuthStore.getState().clearAuth();
  }, [queryClient]);
}
