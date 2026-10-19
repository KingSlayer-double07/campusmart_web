// Only an app path, never another site (the frontend's safeNext in lib/auth/redirects.ts)
export function safeNext(next: unknown): string | null {
  if (
    typeof next !== 'string' ||
    !next.startsWith('/') ||
    next.startsWith('//') ||
    next.startsWith('/onboarding') ||
    next.length > 200
  ) {
    return null;
  }
  return next;
}
