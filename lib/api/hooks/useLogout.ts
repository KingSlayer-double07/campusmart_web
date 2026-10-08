import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/app/store/useAuthStore';
import { useCartStore } from '@/app/store/useCartStore';
import { useFavouritesStore } from '@/app/store/useFavouritesStore';
import { authApi } from '../auth';

// Guide 1.6.9: call the API, clear every cached query, reset the cart and favourites stores and
// remove their localStorage keys, so nothing from this account survives on a shared phone.
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
    useFavouritesStore.setState({ favourites: [] });
    useFavouritesStore.persist.clearStorage();
    useAuthStore.getState().clearAuth();
  }, [queryClient]);
}
