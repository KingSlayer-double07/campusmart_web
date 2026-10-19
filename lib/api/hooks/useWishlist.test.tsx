import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const wishlistApi = vi.hoisted(() => ({ ids: vi.fn(), add: vi.fn(), remove: vi.fn(), merge: vi.fn() }));
vi.mock('../wishlist', () => ({ wishlistApi }));

import { useAuthStore } from '@/app/store/useAuthStore';
import { ApiError } from '../client';
import { SAVED_FAVOURITES_KEY, readSavedFavourites, useSavedFavouritesMerge } from './useSavedFavouritesMerge';
import { useWishlist, wishlistIdsKey } from './useWishlist';

const LAMP = '11111111-1111-4111-8111-111111111111';
const KETTLE = '22222222-2222-4222-8222-222222222222';

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper };
}

const signIn = (overrides: object = {}) =>
  useAuthStore.setState({ user: { id: 'u1', role: 'BUYER', emailVerifiedAt: '2026-10-01T00:00:00Z', ...overrides } as never });

describe('useWishlist (guide 8.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });
  afterEach(() => useAuthStore.setState({ user: null }));

  it('asks nothing of the API for a guest, who has to sign in to save', () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useWishlist(), { wrapper });
    expect(result.current.canSave).toBe(false);
    expect(wishlistApi.ids).not.toHaveBeenCalled();
  });

  it('riders don’t save favourites (DX7)', () => {
    signIn({ role: 'DISPATCH' });
    const { wrapper } = setup();
    expect(renderHook(() => useWishlist(), { wrapper }).result.current.canSave).toBe(false);
  });

  it('toggles at once and puts the heart back if the API refuses', async () => {
    signIn();
    wishlistApi.ids.mockResolvedValue({ listingIds: [LAMP] });
    const { client, wrapper } = setup();
    const { result } = renderHook(() => useWishlist(), { wrapper });
    await waitFor(() => expect(result.current.isSaved(LAMP)).toBe(true));

    let release!: () => void;
    wishlistApi.add.mockReturnValue(new Promise<void>((r) => (release = r)));
    let saving!: Promise<unknown>;
    act(() => {
      saving = result.current.toggle(KETTLE);
    });
    await waitFor(() => expect(result.current.isSaved(KETTLE)).toBe(true));
    release();
    await act(() => saving);
    expect(wishlistApi.add).toHaveBeenCalledWith(KETTLE);

    wishlistApi.remove.mockRejectedValue(new ApiError(500, 'INTERNAL', 'Down'));
    await act(() => result.current.toggle(LAMP).catch(() => undefined));
    expect(wishlistApi.remove).toHaveBeenCalledWith(LAMP);
    expect(client.getQueryData<{ listingIds: string[] }>(wishlistIdsKey)?.listingIds).toContain(LAMP);
  });
});

describe('useSavedFavouritesMerge (R5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });
  afterEach(() => useAuthStore.setState({ user: null }));

  const save = (ids: unknown[]) =>
    localStorage.setItem(SAVED_FAVOURITES_KEY, JSON.stringify({ state: { favourites: ids.map((id) => ({ id })) }, version: 1 }));

  it('reads the phone’s old favourites, keeping only real listing ids', () => {
    save([LAMP, 3, 'nope', LAMP]);
    expect(readSavedFavourites()).toEqual([LAMP]);
    localStorage.setItem(SAVED_FAVOURITES_KEY, '{broken');
    expect(readSavedFavourites()).toEqual([]);
  });

  it('moves them into the account at sign-in, then clears them from the phone', async () => {
    save([LAMP, KETTLE]);
    wishlistApi.merge.mockResolvedValue({ listingIds: [LAMP, KETTLE] });
    signIn();
    const { client, wrapper } = setup();
    renderHook(() => useSavedFavouritesMerge(), { wrapper });
    await waitFor(() => expect(localStorage.getItem(SAVED_FAVOURITES_KEY)).toBeNull());
    expect(wishlistApi.merge).toHaveBeenCalledWith([LAMP, KETTLE]);
    expect(client.getQueryData(wishlistIdsKey)).toEqual({ listingIds: [LAMP, KETTLE] });
  });

  it('keeps them for next time if the merge fails', async () => {
    save([LAMP]);
    wishlistApi.merge.mockRejectedValue(new ApiError(403, 'EMAIL_NOT_VERIFIED', 'Verify first'));
    signIn();
    const { wrapper } = setup();
    renderHook(() => useSavedFavouritesMerge(), { wrapper });
    await waitFor(() => expect(wishlistApi.merge).toHaveBeenCalled());
    expect(localStorage.getItem(SAVED_FAVOURITES_KEY)).not.toBeNull();
  });
});
