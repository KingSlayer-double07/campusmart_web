// The demo seed's check of DATABASE_URL before it connects (added 2026-10-27, after "Can't reach
// database server at base"): the Postgres driver reads any text that isn't a URL, such as the
// placeholder `<Neon pooled URL>` or the Neon console's whole `psql '...'` line, as a database
// name on a host called "base". This says what's wrong in words, and which server it will use.

export interface DatabaseTarget {
  host: string;
  database: string;
  local: boolean;
}

export function describeDatabaseUrl(value: string | undefined): DatabaseTarget {
  const text = value?.trim();
  if (!text) {
    throw new Error(
      'DATABASE_URL isn\'t set. Put it in front of the command (DATABASE_URL="postgresql://..." ' +
        'pnpm run seed:demo; in PowerShell, set $env:DATABASE_URL first) or in backend/.env.',
    );
  }
  if (/^psql\b/i.test(text)) {
    throw new Error(
      "DATABASE_URL is the whole `psql '...'` command from the Neon console. Use only the address " +
        'inside the quotes, from postgresql:// to the end.',
    );
  }
  if (/[<>]/.test(text)) {
    throw new Error(
      "DATABASE_URL still has <angle brackets>, so it's a placeholder, not an address. Paste the real " +
        'connection string from the Neon console (Connect), without the < >.',
    );
  }
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new Error(
      "DATABASE_URL isn't a valid address. It should look like " +
        'postgresql://user:password@host/database?sslmode=require. If the password has special ' +
        'characters (@ # / ? :), they need percent-encoding (@ is %40), or reset the password ' +
        'in Neon to one without them.',
    );
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error(
      `DATABASE_URL starts with "${url.protocol}//" but must start with postgresql://.`,
    );
  }
  if (!url.hostname) {
    throw new Error('DATABASE_URL has no server name between the @ and the /.');
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!database) {
    throw new Error(
      'DATABASE_URL has no database name after the server name (Neon\'s is usually "neondb").',
    );
  }
  return {
    host: url.hostname,
    database,
    local: ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname),
  };
}
