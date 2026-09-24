import {
  splitMentions,
  mentionsMecky,
  activeMentionQuery,
  matchMentionables,
  applyMention,
} from '../mentions';

describe('splitMentions', () => {
  it('marks @Mecky case-insensitively as a mention', () => {
    expect(splitMentions('@mecky worum geht es?')).toEqual([
      { type: 'mention', value: '@mecky' },
      { type: 'text', value: ' worum geht es?' },
    ]);
  });

  it('ignores e-mail addresses and longer words', () => {
    expect(splitMentions('a@mecky.de und @meckyx')).toEqual([
      { type: 'text', value: 'a@mecky.de und @meckyx' },
    ]);
  });

  it('allows punctuation around the mention', () => {
    expect(splitMentions('(@Mecky)')).toEqual([
      { type: 'text', value: '(' },
      { type: 'mention', value: '@Mecky' },
      { type: 'text', value: ')' },
    ]);
  });
});

describe('mentionsMecky', () => {
  it('detects the mention anywhere', () => {
    expect(mentionsMecky('Hey @MECKY!')).toBe(true);
    expect(mentionsMecky('mecky ohne at')).toBe(false);
  });
});

describe('activeMentionQuery', () => {
  it('finds the partial handle before the cursor', () => {
    expect(activeMentionQuery('hallo @Me', 9)).toEqual({ start: 6, query: 'Me' });
    expect(activeMentionQuery('@', 1)).toEqual({ start: 0, query: '' });
  });

  it('needs whitespace or line start before the @', () => {
    expect(activeMentionQuery('hallo@Me', 8)).toBeNull();
  });
});

describe('matchMentionables', () => {
  it('suggests Mecky for an empty or partial query, not a complete one', () => {
    expect(matchMentionables('').map((m) => m.handle)).toEqual(['Mecky']);
    expect(matchMentionables('mec').map((m) => m.handle)).toEqual(['Mecky']);
    expect(matchMentionables('mecky')).toEqual([]);
  });
});

describe('applyMention', () => {
  it('replaces the partial handle and adds a trailing space', () => {
    expect(applyMention('hallo @Me', 6, 9, 'Mecky')).toEqual({ text: 'hallo @Mecky ', cursor: 13 });
  });

  it('keeps the text after the cursor', () => {
    expect(applyMention('@Me wie', 0, 3, 'Mecky')).toEqual({ text: '@Mecky wie', cursor: 7 });
  });
});
