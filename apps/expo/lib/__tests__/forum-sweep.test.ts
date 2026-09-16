import { parseVoteSourceId, selectUnpublished } from '../nostr/forum-sweep';

describe('selectUnpublished', () => {
  it('keeps ids with no ledger row or a non-published row, in input order', () => {
    const ledger = [
      { source_id: 'a', status: 'published' },
      { source_id: 'b', status: 'pending' },
      { source_id: 'c', status: 'rejected' },
    ];
    expect(selectUnpublished(['a', 'b', 'c', 'd'], ledger)).toEqual(['b', 'c', 'd']);
  });
});

describe('parseVoteSourceId', () => {
  it('parses the type:id:pubkeyPrefix ledger key', () => {
    expect(parseVoteSourceId('thread:6b7e0000-2026-4a01-9000-000000000001:abcdef0123456789')).toEqual({
      targetType: 'thread',
      targetId: '6b7e0000-2026-4a01-9000-000000000001',
    });
    expect(parseVoteSourceId('reply:x:y')).toEqual({ targetType: 'reply', targetId: 'x' });
    expect(parseVoteSourceId('post:x:y')).toBeNull();
    expect(parseVoteSourceId('thread')).toBeNull();
  });
});
