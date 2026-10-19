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

// Routes that exchange credentials. A 401 from these is the answer itself, so they never trigger a
// refresh (and /auth/refresh can't recurse). Signed-in auth routes such as /auth/me do refresh.
const NO_REFRESH_ROUTES = [
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/logout',
  '/auth/forgot-password',
  '/auth/reset-password',
];

function skipsRefresh(endpoint: string) {
  const path = endpoint.split('?')[0];
  return NO_REFRESH_ROUTES.includes(path);
}

export async function fetchApi<T = any>(endpoint: string, options: FetchOptions = {}): Promise<T> {
  try {
    return await request<T>(endpoint, options);
  } catch (error) {
    // Anything but a 401, or a 401 from a credential route, is reported as-is.
    if (!(error instanceof ApiError && error.status === 401) || skipsRefresh(endpoint)) {
      throw error;
    }
    const refreshed = await refreshSession();
    if (!refreshed) throw error;
    return request<T>(endpoint, options);
  }
}

// Refresh tokens are single-use: the API ends the session when one is presented twice (D6). So every
// refresh in this tab, the sign-in page's silent one included, shares one request, and tabs take turns
// (they share the cookies), so each sends the latest token. True when rotated; false when the server
// refused the session (the user is signed out); throws when it couldn't tell (network, 429, 5xx).
let refreshPromise: Promise<boolean> | null = null;

export function refreshSession(): Promise<boolean> {
  refreshPromise ??= oneTabAtATime(() => request('/auth/refresh', { method: 'POST' }))
    .then(
      () => true,
      (error) => {
        // Only a refused session signs out. A dropped network, a rate limit or a server error says
        // nothing about the session, and the next request can try again.
        if (!(error instanceof ApiError && (error.status === 401 || error.status === 403))) throw error;
        handleAuthFailure();
        return false;
      },
    )
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

async function oneTabAtATime<T>(task: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  return locks ? await locks.request('campusmart-session-refresh', task) : task();
}

function handleAuthFailure() {
  const { user, clearAuth } = useAuthStore.getState();
  clearAuth();

  // Guests have nothing to lose; only send a signed-in user back to sign-in, and then back here.
  if (!user || typeof window === 'undefined' || window.location.pathname.startsWith('/onboarding')) return;
  const here = `${window.location.pathname}${window.location.search ?? ''}`;
  const signIn =
    user.role === 'SELLER' ? `/onboarding/sellers/sign-in?next=${encodeURIComponent(here)}`
    : user.role === 'BUYER' ? `/onboarding/buyers/sign-in?next=${encodeURIComponent(here)}`
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
      // Send the first-party auth cookies (D1, D6)
      credentials: 'include',
      signal: controller.signal,
    });

    // Some endpoints don't return JSON (e.g. 204 No Content)
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
