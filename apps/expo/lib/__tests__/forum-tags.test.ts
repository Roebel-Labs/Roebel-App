import { officialThreadTags } from '../nostr/forum-tags';

describe('officialThreadTags', () => {
  it('is empty for citizen threads', () => {
    expect(officialThreadTags({ source: 'citizen', source_url: null, source_citation: null, source_score: null, source_rank: null })).toEqual([]);
  });
  it('marks Bürgerrat threads with t/r/source/score/rank', () => {
    expect(
      officialThreadTags({
        source: 'buergerrat',
        source_url: 'https://www.ndr.de/x',
        source_citation: 'Broschüre 2026',
        source_score: 13,
        source_rank: 1,
      }),
    ).toEqual([
      ['t', 'buergerrat'],
      ['r', 'https://www.ndr.de/x'],
      ['source', 'Broschüre 2026'],
      ['score', '13'],
      ['rank', '1'],
    ]);
  });
});
