import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/app/store/useAuthStore';
import { wishlistApi, type WishlistIds } from '../wishlist';

export const wishlistKey = ['wishlist'] as const;
export const wishlistIdsKey = ['wishlist', 'ids'] as const;
const wishlistPageKey = ['wishlist', 'page'] as const;

// Favourites need an account with a verified email; riders don't buy (DX7)
function useCanSave() {
  return useAuthStore((s) => !!s.user?.emailVerifiedAt && s.user.role !== 'DISPATCH');
}

// Guide 8.1: the hearts. Toggling shows at once and is put back if the API refuses.
export function useWishlist() {
  const canSave = useCanSave();
  const queryClient = useQueryClient();
  const ids = useQuery({
    queryKey: wishlistIdsKey,
    queryFn: () => wishlistApi.ids(),
    enabled: canSave,
    staleTime: 5 * 60 * 1000,
  });
  const toggle = useMutation({
    mutationFn: ({ listingId, saved }: { listingId: string; saved: boolean }) =>
      saved ? wishlistApi.remove(listingId) : wishlistApi.add(listingId),
    onMutate: async ({ listingId, saved }) => {
      await queryClient.cancelQueries({ queryKey: wishlistIdsKey });
      const previous = queryClient.getQueryData<WishlistIds>(wishlistIdsKey);
      const current = previous?.listingIds ?? [];
      queryClient.setQueryData<WishlistIds>(wishlistIdsKey, {
        listingIds: saved ? current.filter((id) => id !== listingId) : [listingId, ...current],
      });
      return { previous };
    },
    onError: (_error, _vars, context) => queryClient.setQueryData(wishlistIdsKey, context?.previous),
    onSettled: () => queryClient.invalidateQueries({ queryKey: wishlistPageKey }),
  });

  const saved = new Set(ids.data?.listingIds ?? []);
  return {
    canSave,
    count: saved.size,
    isSaved: (listingId: string) => saved.has(listingId),
    toggle: (listingId: string) => toggle.mutateAsync({ listingId, saved: saved.has(listingId) }),
  };
}

// The favourites page and the carousels that show them
export function useWishlistPage(limit = 20) {
  const canSave = useCanSave();
  return useInfiniteQuery({
    queryKey: [...wishlistPageKey, limit],
    queryFn: ({ pageParam }) => wishlistApi.list({ cursor: pageParam, limit }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: canSave,
  });
}
