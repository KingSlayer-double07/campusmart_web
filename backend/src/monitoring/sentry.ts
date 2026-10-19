import type { ErrorEvent, NodeOptions } from '@sentry/nestjs';

// Headers that carry credentials; never sent to Sentry
const SECRET_HEADERS = ['authorization', 'cookie', 'x-paystack-signature'];

// Error reporting (decision T8). Off unless SENTRY_DSN is set; errors only, no tracing.
export function sentryOptions(
  env: NodeJS.ProcessEnv,
): (NodeOptions & { dsn: string }) | null {
  const dsn = env.SENTRY_DSN?.trim();
  if (!dsn) return null;
  return {
    dsn,
    environment:
      env.SENTRY_ENVIRONMENT?.trim() || env.NODE_ENV || 'development',
    sendDefaultPii: false,
    beforeSend: scrubEvent,
  };
}

// Request bodies hold passwords, codes and addresses; cookies, some headers and query strings
// hold tokens
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const request = event.request;
  if (request) {
    delete request.data;
    delete request.cookies;
    delete request.query_string;
    if (request.url) request.url = request.url.split('?')[0]; // OAuth codes, tokens
    if (request.headers) {
      for (const name of Object.keys(request.headers)) {
        if (SECRET_HEADERS.includes(name.toLowerCase())) {
          delete request.headers[name];
        }
      }
    }
  }
  delete event.user;
  return event;
}
