import {
  findBannedWords,
  normaliseWords,
  STARTER_BANNED_WORDS,
} from './moderation-rules';

describe('moderation rules', () => {
  describe('findBannedWords', () => {
    const words = ['gun', 'fake id', 'c++', 'ammo'];

    it('finds whole words in any case', () => {
      expect(findBannedWords('Toy GUN for display', words)).toEqual(['gun']);
      expect(findBannedWords('Gun, ammo.', words)).toEqual(['gun', 'ammo']);
    });

    it('ignores the word inside another word', () => {
      expect(findBannedWords('I have begun; gunner; shotguns', words)).toEqual(
        [],
      );
      expect(findBannedWords('ammonia cleaner', words)).toEqual([]);
    });

    it('matches phrases across any spacing or a line break', () => {
      expect(findBannedWords('Selling a fake   ID card', words)).toEqual([
        'fake id',
      ]);
      expect(findBannedWords('fake\nid', words)).toEqual(['fake id']);
    });

    it('treats regex characters literally', () => {
      expect(findBannedWords('Learn C++ today', words)).toEqual(['c++']);
      expect(findBannedWords('Learn C today', words)).toEqual([]);
    });

    it('sees word edges in other alphabets and digits', () => {
      expect(findBannedWords('gun9', words)).toEqual([]);
      expect(findBannedWords('égun', words)).toEqual([]);
      expect(findBannedWords('(gun)', words)).toEqual(['gun']);
    });
  });

  it('normalises the list: lower case, single spaces, no duplicates, sorted', () => {
    expect(normaliseWords([' Gun ', 'FAKE   id', 'gun', '', 'ammo'])).toEqual([
      'ammo',
      'fake id',
      'gun',
    ]);
  });

  it('starts from a clean list drawn from the prohibited items (M5)', () => {
    expect(normaliseWords(STARTER_BANNED_WORDS)).toHaveLength(
      STARTER_BANNED_WORDS.length,
    );
    expect(STARTER_BANNED_WORDS).toEqual(
      expect.arrayContaining(['gun', 'cocaine', 'stolen', 'fake id']),
    );
  });
});
