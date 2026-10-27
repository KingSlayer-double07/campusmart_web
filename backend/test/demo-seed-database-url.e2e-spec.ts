import { describeDatabaseUrl } from '../prisma/demo/database-url';

// "Can't reach database server at base": text that isn't a URL reads as a database on a host called
// "base". The demo seed now says what's wrong before it connects (2026-10-27).
describe('Demo seed: DATABASE_URL check', () => {
  it("names the server and database of a Neon address, and doesn't treat it as local", () => {
    expect(
      describeDatabaseUrl(
        'postgresql://neondb_owner:secret@ep-quiet-sun-123-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
      ),
    ).toEqual({
      host: 'ep-quiet-sun-123-pooler.c-2.us-east-1.aws.neon.tech',
      database: 'neondb',
      local: false,
    });
  });

  it('accepts postgres:// and surrounding spaces, and flags a local database', () => {
    expect(
      describeDatabaseUrl(
        '  postgres://postgres:postgres@localhost:5432/campusmart_dev ',
      ),
    ).toEqual({ host: 'localhost', database: 'campusmart_dev', local: true });
  });

  it.each([
    [undefined, /isn't set/],
    ['', /isn't set/],
    ['<Neon pooled URL>', /angle brackets/],
    ['postgresql://u:<password>@ep-1.neon.tech/neondb', /angle brackets/],
    ["psql 'postgresql://u:p@ep-1.neon.tech/neondb?sslmode=require'", /psql/],
    ['base', /valid address/],
    ['postgresql://u:pa#ss@ep-1.neon.tech/neondb', /percent-encoding/],
    ['mysql://u:p@ep-1.neon.tech/neondb', /must start with postgresql/],
    ['postgresql:///neondb', /no server name/],
    ['postgresql://u:p@ep-1.neon.tech', /no database name/],
  ])('explains %j', (value, message) => {
    expect(() => describeDatabaseUrl(value)).toThrow(message);
  });

  it('never puts the password in a message', () => {
    for (const value of [
      'postgresql://u:hunter2secret@ep-1.neon.tech',
      'postgresql://u:hunter2@secret#@ep-1.neon.tech/neondb',
    ]) {
      try {
        describeDatabaseUrl(value);
      } catch (error) {
        expect((error as Error).message).not.toContain('hunter2');
      }
    }
  });
});
