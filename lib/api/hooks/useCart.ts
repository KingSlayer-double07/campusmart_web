import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/app/store/useAuthStore';
import { useCartStore, type CartItem as GuestItem } from '@/app/store/useCartStore';
import { CATEGORY_LABELS } from '@/lib/labels';
import { cartApi, type Cart, type CartIssue } from '../checkout';
import type { Listing, ListingVariant } from '../listings';

export const cartKey = ['cart'] as const;

// One cart line, whichever cart it came from
export interface CartLine {
  key: string;
  /** The server line's id; null for a guest line */
  id: string | null;
  listingId: string;
  variantId: string | null;
  title: string;
  imageUrl: string | null;
  categoryLabel: string;
  variantLabel: string | null;
  unitPriceKobo: number;
  quantity: number;
  /** Most the stepper allows (0 when it can't be bought) */
  maxQuantity: number;
  available: boolean;
  issue: CartIssue | null;
}

export interface CartLineGroup {
  sellerId: string | null;
  storeName: string | null;
  lines: CartLine[];
  subtotalKobo: number;
}

export interface CartView {
  mode: 'server' | 'guest';
  groups: CartLineGroup[];
  subtotalKobo: number;
  itemCount: number;
  lineCount: number;
  issues: CartIssue[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
}

const guestKey = (listingId: string, variantId: string | null) => `${listingId}|${variantId ?? ''}`;

export function fromServerCart(cart: Cart): Omit<CartView, 'mode' | 'isLoading' | 'isError' | 'error' | 'refetch'> {
  const issueFor = new Map(cart.issues.map((i) => [i.itemId, i]));
  const groups = cart.groups.map((g) => ({
    sellerId: g.seller.id,
    storeName: g.seller.storeName,
    subtotalKobo: g.subtotalKobo,
    lines: g.items.map((item) => ({
      key: item.id,
      id: item.id,
      listingId: item.listing.id,
      variantId: item.variant?.id ?? null,
      title: item.listing.title,
      imageUrl: item.listing.imageUrl,
      categoryLabel: CATEGORY_LABELS[item.listing.category],
      variantLabel: item.variant?.label ?? null,
      unitPriceKobo: item.unitPriceKobo,
      quantity: item.quantity,
      maxQuantity: item.maxQuantity,
      available: item.available,
      issue: issueFor.get(item.id) ?? null,
    })),
  }));
  return {
    groups,
    subtotalKobo: cart.subtotalKobo,
    itemCount: cart.itemCount,
    lineCount: groups.reduce((n, g) => n + g.lines.length, 0),
    issues: cart.issues,
  };
}

export function fromGuestCart(items: GuestItem[]): Omit<CartView, 'mode' | 'isLoading' | 'isError' | 'error' | 'refetch'> {
  const groups = new Map<string, CartLineGroup>();
  for (const item of items) {
    const sellerKey = item.sellerId ?? '';
    const group = groups.get(sellerKey) ?? {
      sellerId: item.sellerId ?? null,
      storeName: item.storeName ?? null,
      lines: [],
      subtotalKobo: 0,
    };
    group.lines.push({
      key: guestKey(item.id, item.variantId),
      id: null,
      listingId: item.id,
      variantId: item.variantId,
      title: item.name,
      imageUrl: item.image,
      categoryLabel: item.category,
      variantLabel: item.variantId ? item.size : null,
      unitPriceKobo: item.priceKobo,
      quantity: item.quantity,
      maxQuantity: item.stockCount,
      available: item.stockCount > 0,
      issue: null,
    });
    group.subtotalKobo += item.priceKobo * item.quantity;
    groups.set(sellerKey, group);
  }
  const list = [...groups.values()];
  return {
    groups: list,
    subtotalKobo: list.reduce((sum, g) => sum + g.subtotalKobo, 0),
    itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
    lineCount: items.length,
    issues: [],
  };
}

// Signed in means a verified account here: the server cart needs a verified email
function useSignedIn() {
  return useAuthStore((s) => !!s.user?.emailVerifiedAt);
}

export function useServerCart(enabled = true) {
  return useQuery({ queryKey: cartKey, queryFn: () => cartApi.get(), enabled });
}

// Guide 4.3.1: the server cart when signed in, otherwise this device's guest cart
export function useCart(): CartView {
  const signedIn = useSignedIn();
  const { data, isPending, isError, error, refetch } = useServerCart(signedIn);
  const guestItems = useCartStore((s) => s.cart);

  return useMemo(() => {
    if (!signedIn) {
      return { mode: 'guest', ...fromGuestCart(guestItems), isLoading: false, isError: false, error: null, refetch: () => undefined };
    }
    const empty = { groups: [], subtotalKobo: 0, itemCount: 0, lineCount: 0, issues: [] };
    return {
      mode: 'server',
      ...(data ? fromServerCart(data) : empty),
      isLoading: isPending,
      isError,
      error,
      refetch: () => void refetch(),
    };
  }, [signedIn, guestItems, data, isPending, isError, error, refetch]);
}

// Adds, sets and removes lines in whichever cart is in use. Server errors (sold out, gone) are
// thrown as ApiError for the caller to show; the cart is refetched so the page catches up.
export function useCartActions() {
  const signedIn = useSignedIn();
  const queryClient = useQueryClient();
  const guest = useCartStore();

  const onServerCart = (cart: Cart) => queryClient.setQueryData(cartKey, cart);
  const refetch = () => queryClient.invalidateQueries({ queryKey: cartKey });

  const setItem = useMutation({
    mutationFn: (body: Parameters<typeof cartApi.setItem>[0]) => cartApi.setItem(body),
    onSuccess: onServerCart,
    onError: refetch,
  });
  const removeItem = useMutation({
    mutationFn: (id: string) => cartApi.removeItem(id),
    onSuccess: refetch,
    onError: refetch,
  });

  const setQuantity = useCallback(
    async (line: Pick<CartLine, 'listingId' | 'variantId' | 'variantLabel'>, quantity: number) => {
      if (!signedIn) {
        guest.setQuantity(line.listingId, line.variantLabel ?? 'default', quantity);
        return;
      }
      await setItem.mutateAsync({
        listingId: line.listingId,
        ...(line.variantId && { variantId: line.variantId }),
        quantity,
      });
    },
    [signedIn, guest, setItem],
  );

  const remove = useCallback(
    async (line: Pick<CartLine, 'id' | 'listingId' | 'variantLabel'>) => {
      if (!signedIn || !line.id) {
        guest.removeFromCart(line.listingId, line.variantLabel ?? 'default');
        return;
      }
      await removeItem.mutateAsync(line.id);
    },
    [signedIn, guest, removeItem],
  );

  // The product page's "Add to Cart": one more of this listing (and option)
  const add = useCallback(
    async (listing: Listing, variant: ListingVariant | null, currentQuantity: number) => {
      if (!signedIn) {
        guest.addToCart({
          id: listing.id,
          variantId: variant?.id ?? null,
          name: listing.title,
          priceKobo: variant?.priceKobo ?? listing.priceKobo,
          image: listing.imageUrl,
          quantity: 1,
          category: CATEGORY_LABELS[listing.category],
          size: variant?.label ?? 'default',
          stockCount: variant ? variant.stock : listing.stock,
          sellerId: listing.seller.id,
          storeName: listing.seller.displayName,
        });
        return;
      }
      await setItem.mutateAsync({
        listingId: listing.id,
        ...(variant && { variantId: variant.id }),
        quantity: currentQuantity + 1,
      });
    },
    [signedIn, guest, setItem],
  );

  return { setQuantity, remove, add, isPending: setItem.isPending || removeItem.isPending };
}

// How many of this listing (and option) are in the cart
export function quantityInCart(cart: CartView, listingId: string, variantId: string | null): number {
  for (const group of cart.groups) {
    const line = group.lines.find((l) => l.listingId === listingId && l.variantId === variantId);
    if (line) return line.quantity;
  }
  return 0;
}

// Lines checkout would refuse: gone, sold out, or more than is left. A price change only warns.
export function blockingIssues(cart: Pick<CartView, 'issues'>): CartIssue[] {
  return cart.issues.filter((i) => i.type !== 'PRICE_CHANGED');
}
