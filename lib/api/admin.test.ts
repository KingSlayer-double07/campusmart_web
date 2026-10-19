import { describe, expect, it } from 'vitest';
import { toParams } from './admin';

describe('toParams', () => {
  it('drops empty filters and stringifies the rest', () => {
    expect(toParams({ q: '', status: undefined, limit: 20, cursor: 'c1' })).toEqual({
      limit: '20',
      cursor: 'c1',
    });
  });
});
