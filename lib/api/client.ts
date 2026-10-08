import { useAuthStore } from '@/app/store/useAuthStore';

const BASE_URL = '/api';
const TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  constructor(
    public status: number, // 0 for network failures and timeouts
    public code: string,   // machine-readable, e.g. 'VALIDATION_FAILED', 'OUT_OF_STOCK', 'NETWORK'
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface FetchOptions extends RequestInit {
  params?: Record<string, string>;
}

export async function fetchApi<T = any>(endpoint: string, options: FetchOptions = {}): Promise<T> {
  try {
    return await request<T>(endpoint, options);
  } catch (error) {
    // Auth routes (login, refresh, me, ...) report 401 as-is; anything else gets one refresh + retry.
    if (!(error instanceof ApiError && error.status === 401) || endpoint.startsWith('/auth/')) {
      throw error;
    }
    const refreshed = await refreshSession();
    if (!refreshed) throw error;
    return request<T>(endpoint, options);
  }
}

// Shared across callers so parallel 401s trigger a single refresh.
let refreshPromise: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  refreshPromise ??= request('/auth/refresh', { method: 'POST' })
    .then(
      () => true,
      (error) => {
        // Only sign out when the server rejected the session, not when the network dropped.
        if (error instanceof ApiError && error.status === 0) throw error;
        handleAuthFailure();
        return false;
      },
    )
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

function handleAuthFailure() {
  const { user, clearAuth } = useAuthStore.getState();
  clearAuth();

  if (typeof window === 'undefined' || window.location.pathname.startsWith('/onboarding')) return;
  const signIn =
    user?.role === 'SELLER' ? '/onboarding/sellers/sign-in'
    : user?.role === 'BUYER' ? '/onboarding/buyers/sign-in'
    : '/onboarding/role-select';
  window.location.assign(signIn);
}

async function request<T>(endpoint: string, options: FetchOptions): Promise<T> {
  const { params, headers, signal, ...customConfig } = options;

  let url = `${BASE_URL}${endpoint}`;
  if (params) {
    url += `?${new URLSearchParams(params).toString()}`;
  }

  // Abort on timeout, and also when the caller's own signal (e.g. React Query cancellation) aborts.
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, TIMEOUT_MS);
  const onCallerAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', onCallerAbort);

  try {
    const response = await fetch(url, {
      ...customConfig,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      // Ensure cookies are sent with requests (crucial for our HTTP-only JWTs)
      credentials: 'include',
      signal: controller.signal,
    });

    // Some endpoints might not return JSON (e.g. 204 No Content)
    const contentType = response.headers.get('content-type');
    const body = contentType?.includes('application/json') ? await response.json() : await response.text();

    if (!response.ok) {
      // Backend error shape: { statusCode, code, message, details?, path, timestamp }
      const message = body?.message ?? (response.statusText || 'An unexpected error occurred');
      throw new ApiError(
        response.status,
        body?.code ?? 'UNKNOWN',
        Array.isArray(message) ? message.join(', ') : message,
        body?.details,
      );
    }

    // Successful responses are wrapped as { success, data, timestamp }
    return (body !== null && typeof body === 'object' && 'data' in body ? body.data : body) as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (timedOut) throw new ApiError(0, 'NETWORK', 'Request timed out');
    if (signal?.aborted) throw error; // caller cancelled; let them see the AbortError
    throw new ApiError(0, 'NETWORK', error instanceof Error ? error.message : 'Network request failed');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onCallerAbort);
  }
}
