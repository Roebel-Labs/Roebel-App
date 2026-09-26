import { pickRecentThreads } from '../format';
import type { ChatThread } from '../types';

const th = (id: string, lastMessageAt: string) => ({ id, lastMessageAt }) as unknown as ChatThread;

describe('pickRecentThreads', () => {
  it('returns the newest threads first, capped at count', () => {
    const out = pickRecentThreads(
      [th('a', '2026-09-20T10:00:00Z'), th('b', '2026-09-25T10:00:00Z'), th('c', '2026-09-22T10:00:00Z')],
      2,
    );
    expect(out.map((t) => t.id)).toEqual(['b', 'c']);
  });

  it('tolerates missing or empty input', () => {
    expect(pickRecentThreads(undefined)).toEqual([]);
    expect(pickRecentThreads(null)).toEqual([]);
    expect(pickRecentThreads([])).toEqual([]);
    expect(pickRecentThreads([th('a', '2026-09-20T10:00:00Z')], 0)).toEqual([]);
  });
});
