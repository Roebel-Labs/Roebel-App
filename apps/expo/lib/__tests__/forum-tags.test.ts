import { attachmentContentSuffix, attachmentTags, officialThreadTags } from '../nostr/forum-tags';

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

describe('attachment tags', () => {
  const items = [
    { url: 'https://x/a.jpg', mime_type: 'image/jpeg', file_name: 'a.jpg' },
    { url: 'https://x/b.pdf', mime_type: 'application/pdf', file_name: 'Plan.pdf' },
  ];
  it('builds NIP-92 imeta tags and a URL suffix', () => {
    expect(attachmentTags(items)).toEqual([
      ['imeta', 'url https://x/a.jpg', 'm image/jpeg', 'alt a.jpg'],
      ['imeta', 'url https://x/b.pdf', 'm application/pdf', 'alt Plan.pdf'],
    ]);
    expect(attachmentContentSuffix(items)).toBe('\n\nhttps://x/a.jpg\nhttps://x/b.pdf');
    expect(attachmentContentSuffix([])).toBe('');
  });
});
