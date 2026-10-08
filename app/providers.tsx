'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { useState, useEffect } from 'react';
import { ApiError } from '@/lib/api/client';

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            gcTime: 1000 * 60 * 60 * 24, // 24 hours (used to be cacheTime)
            refetchOnWindowFocus: false,
            // Never retry 4xx (the request itself is wrong); retry network/5xx up to twice
            retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
          },
        },
      })
  );

  const [persister, setPersister] = useState<any>(null);

  useEffect(() => {
    // We instantiate the persister in useEffect so it only runs on the client
    // where window.localStorage is available.
    if (typeof window !== 'undefined') {
      setPersister(
        createSyncStoragePersister({
          storage: window.localStorage,
        })
      );
    }
  }, []);

  // While rendering on the server or before useEffect fires, we must still provide the QueryClient
  // to avoid crashes when pages use React Query hooks during prerendering.
  if (!persister) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
