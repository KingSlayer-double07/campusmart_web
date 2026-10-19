import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const listingsApi = vi.hoisted(() => ({ browse: vi.fn(), get: vi.fn(), related: vi.fn() }));
vi.mock('../listings', () => ({ listingsApi }));

import { useAuthStore } from '@/app/store/useAuthStore';
import { useGuestStore } from '@/app/store/useGuestStore';
import { useListing, useListings } from './useListings';

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>;
}

describe('listing reads for guests (decision 2026-10-19)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listingsApi.browse.mockResolvedValue({ items: [], nextCursor: null });
    listingsApi.get.mockResolvedValue({ id: 'l1' });
    useAuthStore.setState({ user: null });
    useGuestStore.setState({ school: null });
  });
  afterEach(cleanup);

  it('a guest asks for the school they picked', async () => {
    useGuestStore.setState({ school: { id: 'unilag', name: 'University of Lagos' } });
    renderHook(() => useListings({ sort: 'newest' }), { wrapper });
    renderHook(() => useListing('l1'), { wrapper });
    await waitFor(() => expect(listingsApi.browse).toHaveBeenCalledWith({ sort: 'newest', cursor: undefined, institutionId: 'unilag' }));
    await waitFor(() => expect(listingsApi.get).toHaveBeenCalledWith('l1', 'unilag'));
  });

  it('signed in, no school is sent: the API uses your own', async () => {
    useGuestStore.setState({ school: { id: 'unilag', name: 'University of Lagos' } });
    useAuthStore.setState({ user: { id: 'u1', institutionId: 'ui' } as never });
    renderHook(() => useListings(), { wrapper });
    await waitFor(() => expect(listingsApi.browse).toHaveBeenCalledWith({ cursor: undefined, institutionId: undefined }));
  });

  it("a guest who hasn't picked a school fetches nothing", async () => {
    const { result } = renderHook(() => useListings(), { wrapper });
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.fetchStatus).toBe('idle');
    expect(listingsApi.browse).not.toHaveBeenCalled();
  });
});
