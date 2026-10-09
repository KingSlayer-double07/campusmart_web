import { cursorArgs, toPage } from './pagination';

describe('cursor pagination', () => {
  it('asks for one extra row, and skips the cursor row itself', () => {
    expect(cursorArgs({ limit: 20 })).toEqual({ take: 21 });
    expect(cursorArgs({ limit: 5, cursor: 'c' })).toEqual({
      take: 6,
      cursor: { id: 'c' },
      skip: 1,
    });
  });

  it('returns the last id as nextCursor only when there is another page', () => {
    const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(toPage(rows, 2)).toEqual({
      items: [{ id: 'a' }, { id: 'b' }],
      nextCursor: 'b',
    });
    expect(toPage(rows, 3)).toEqual({ items: rows, nextCursor: null });
  });
});
