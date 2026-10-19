import { readFileSync } from 'fs';
import { join } from 'path';

// D3: money is an integer number of kobo everywhere. Guards the schema so a Decimal or a
// non-integer *Kobo column can't creep back in.
describe('schema.prisma money columns', () => {
  const schema = readFileSync(
    join(__dirname, '../../prisma/schema.prisma'),
    'utf8',
  );
  const fields = schema
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, '').trim())
    .map((line) => /^(\w+)\s+(\w+)(\??)/.exec(line))
    .filter((match): match is RegExpExecArray => match !== null);

  it('has no Decimal anywhere', () => {
    expect(schema).not.toMatch(/Decimal/);
  });

  it('stores every *Kobo field as Int', () => {
    const kobo = fields.filter(([, name]) => name.endsWith('Kobo'));
    expect(kobo.length).toBeGreaterThan(0);
    for (const [, name, type] of kobo) {
      expect(`${name}: ${type}`).toBe(`${name}: Int`);
    }
  });
});
