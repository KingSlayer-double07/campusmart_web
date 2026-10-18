# Sentry and /api/health check against the built API (10.4)

Run 2026-10-18. Setup: `node dist/main` on port 4100 with DATABASE_URL pointing at a closed port
(127.0.0.1:5999), SENTRY_DSN=http://publickey@127.0.0.1:9999/1 and SENTRY_ENVIRONMENT=local-check.
The DSN points at a local sink (`sentry-sink.mjs` in this folder) that stores what it receives.
No real Sentry project was contacted.

```
== GET /api/health (database down)
HTTP/1.1 503 Service Unavailable
Cache-Control: no-cache, no-store, must-revalidate
{"statusCode":503,"code":"UNHEALTHY","message":"The database is unreachable","details":{"database":"down"},"path":"/api/health","timestamp":"2026-10-18T20:42:30.951Z"}

== POST /api/auth/login?next=/secret-query with a password (database down)
HTTP/1.1 500 Internal Server Error
{"statusCode":500,"code":"INTERNAL","message":"Internal server error","path":"/api/auth/login?next=/secret-query","timestamp":"2026-10-18T20:42:31.056Z"}
```

Envelopes received by the sink: 1. Only the 500 is reported; the deliberate 503 isn't.

```
--- POST /api/1/envelope/?sentry_version=7&sentry_key=publickey&sentry_client=sentry.javascript.nestjs%2F10.76.0
environment: local-check
exception: ['PrismaClientKnownRequestError']
request: {"headers": {"host": "localhost:4100", "user-agent": "curl/8.5.0", "accept": "*/*", "content-type": "application/json", "content-length": "65"}, "method": "POST", "url": "http://localhost:4100/api/auth/login"}
user: None
```

Secrets searched for in everything the sink received (number of matches):

- `SecretPass123`: 0
- `secret-cookie-value`: 0
- `secret-bearer`: 0
- `secret-query`: 0
- `ada@students`: 0
