import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const merge = vi.hoisted(() => vi.fn());
vi.mock('../checkout', () => ({ cartApi: { merge } }));

import { useAuthStore } from '@/app/store/useAuthStore';
import { useCartStore } from '@/app/store/useCartStore';
import { cartKey } from './useCart';
import { useGuestCartMerge } from './useGuestCartMerge';

function Merger() {
  useGuestCartMerge();
  return null;
}

const guestLine = (overrides: object = {}) => ({
  id: 'l1',
  variantId: null,
  name: 'Desk lamp',
  priceKobo: 450_000,
  image: null,
  quantity: 2,
  category: 'Tech',
  size: 'default',
  stockCount: 3,
  ...overrides,
});

function renderMerger() {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <Merger />
    </QueryClientProvider>,
  );
  return client;
}

describe('useGuestCartMerge', () => {
  beforeEach(() => {
    merge.mockReset();
    useCartStore.setState({ cart: [guestLine(), guestLine({ id: 'l2', variantId: 'v1', size: 'L', quantity: 500 })] });
  });
  afterEach(cleanup);

  it('merges the guest cart after a verified sign-in, then clears it', async () => {
    useAuthStore.setState({ user: { id: 'u1', emailVerifiedAt: '2026-10-01T00:00:00Z' } as never });
    const cart = { groups: [], subtotalKobo: 0, itemCount: 0, issues: [] };
    merge.mockResolvedValue(cart);
    const client = renderMerger();

    await waitFor(() => expect(useCartStore.getState().cart).toEqual([]));
    // Item ids and quantities only, never prices; quantities capped at 100
    expect(merge).toHaveBeenCalledWith([
      { listingId: 'l1', quantity: 2 },
      { listingId: 'l2', variantId: 'v1', quantity: 100 },
    ]);
    expect(client.getQueryData(cartKey)).toBe(cart);
  });

  it('waits for a verified email, and keeps the guest cart if the merge fails', async () => {
    useAuthStore.setState({ user: { id: 'u1', emailVerifiedAt: null } as never });
    renderMerger();
    expect(merge).not.toHaveBeenCalled();
    cleanup();

    useAuthStore.setState({ user: { id: 'u1', emailVerifiedAt: '2026-10-01T00:00:00Z' } as never });
    merge.mockRejectedValue(new Error('offline'));
    renderMerger();
    await waitFor(() => expect(merge).toHaveBeenCalledTimes(1));
    expect(useCartStore.getState().cart).toHaveLength(2);
  });

  it('does nothing for a guest', () => {
    useAuthStore.setState({ user: null });
    renderMerger();
    expect(merge).not.toHaveBeenCalled();
  });
});
