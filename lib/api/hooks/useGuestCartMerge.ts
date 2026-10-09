import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/app/store/useAuthStore';
import { useCartStore } from '@/app/store/useCartStore';
import { cartApi } from '../checkout';
import { cartKey } from './useCart';

const MAX_LINES = 50;
const MAX_QUANTITY = 100;

// Guide 4.3.1: after sign-in, this device's guest cart joins the account's cart once, then the
// guest cart is cleared. If the merge fails (offline, email not verified yet) it stays for next time.
export function useGuestCartMerge() {
  const userId = useAuthStore((s) => (s.user?.emailVerifiedAt ? s.user.id : null));
  const queryClient = useQueryClient();
  const running = useRef(false);

  useEffect(() => {
    if (!userId || running.current) return;
    const items = useCartStore.getState().cart;
    if (items.length === 0) return;

    running.current = true;
    cartApi
      .merge(
        items.slice(0, MAX_LINES).map((item) => ({
          listingId: item.id,
          ...(item.variantId && { variantId: item.variantId }),
          quantity: Math.min(Math.max(item.quantity, 1), MAX_QUANTITY),
        })),
      )
      .then((cart) => {
        queryClient.setQueryData(cartKey, cart);
        useCartStore.setState({ cart: [] });
      })
      .catch(() => undefined)
      .finally(() => {
        running.current = false;
      });
  }, [userId, queryClient]);
}
