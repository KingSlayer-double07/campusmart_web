import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';

export const LISTING_SORTS = [
  'newest',
  'price_asc',
  'price_desc',
  'popular',
] as const;
export type ListingSort = (typeof LISTING_SORTS)[number];

// Guide 3.1 rule 7: keyset paging on (createdAt, id), with the price in front for price sorts;
// offset paging only for 'popular', capped at 200 results.
export const POPULAR_CAP = 200;

interface KeysetCursor {
  s: Exclude<ListingSort, 'popular'>;
  c: string; // createdAt ISO
  i: string; // id
  p?: number; // priceKobo, price sorts only
}
interface OffsetCursor {
  s: 'popular';
  o: number;
}
export type ListingCursor = KeysetCursor | OffsetCursor;

export function encodeCursor(cursor: ListingCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

const invalid = () =>
  new BadRequestException({
    code: 'VALIDATION_FAILED',
    message: 'That page link has expired. Start again from the top.',
  });

export function decodeCursor(
  raw: string | undefined,
  sort: ListingSort,
): ListingCursor | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw invalid();
  }
  if (!value || typeof value !== 'object') throw invalid();
  const c = value as {
    s?: unknown;
    c?: unknown;
    i?: unknown;
    p?: unknown;
    o?: unknown;
  };
  if (c.s !== sort) throw invalid();
  if (sort === 'popular') {
    if (typeof c.o !== 'number' || !Number.isInteger(c.o) || c.o < 0) {
      throw invalid();
    }
    return { s: 'popular', o: c.o };
  }
  if (typeof c.c !== 'string' || Number.isNaN(Date.parse(c.c))) throw invalid();
  if (typeof c.i !== 'string') throw invalid();
  if (sort === 'newest') return { s: sort, c: c.c, i: c.i };
  if (typeof c.p !== 'number' || !Number.isInteger(c.p)) throw invalid();
  return { s: sort, c: c.c, i: c.i, p: c.p };
}

export function orderByFor(
  sort: Exclude<ListingSort, 'popular'>,
): Prisma.ListingOrderByWithRelationInput[] {
  const recent: Prisma.ListingOrderByWithRelationInput[] = [
    { createdAt: 'desc' },
    { id: 'desc' },
  ];
  if (sort === 'price_asc') return [{ priceKobo: 'asc' }, ...recent];
  if (sort === 'price_desc') return [{ priceKobo: 'desc' }, ...recent];
  return recent;
}

// Rows strictly after the cursor row, in the same order as orderByFor
export function afterCursor(cursor: KeysetCursor): Prisma.ListingWhereInput {
  const createdAt = new Date(cursor.c);
  const tail: Prisma.ListingWhereInput[] = [
    { createdAt: { lt: createdAt } },
    { createdAt, id: { lt: cursor.i } },
  ];
  if (cursor.s === 'newest') return { OR: tail };
  const p = cursor.p!;
  return {
    OR: [
      { priceKobo: cursor.s === 'price_asc' ? { gt: p } : { lt: p } },
      ...tail.map((t) => ({ priceKobo: p, ...t })),
    ],
  };
}

export function cursorAfter(
  sort: Exclude<ListingSort, 'popular'>,
  row: { createdAt: Date; id: string; priceKobo: number },
): string {
  return encodeCursor({
    s: sort,
    c: row.createdAt.toISOString(),
    i: row.id,
    ...(sort !== 'newest' && { p: row.priceKobo }),
  });
}

// ILIKE treats % and _ as wildcards; a search for "50%" means the characters
export const escapeLike = (text: string) => text.replace(/[\\%_]/g, '\\$&');
