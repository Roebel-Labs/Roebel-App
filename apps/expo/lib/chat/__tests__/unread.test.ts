import { firstNewMessageId, markThreadReadIn, mergeThreadIn } from '../unread';
import { formatSchedule } from '../routines';
import { initialThreadState, threadReducer } from '../reducer';
import type { ChatMessage, ChatThread } from '../types';

const msg = (id: string, role: ChatMessage['role'], createdAt: string): ChatMessage => ({
  id,
  threadId: 't1',
  role,
  botId: role === 'bot' ? 'b1' : null,
  parts: [{ type: 'text', text: id }],
  replyTo: null,
  reactions: {},
  createdAt,
});

const thread = (id: string, over: Partial<ChatThread> = {}): ChatThread => ({
  id,
  title: id,
  topic: null,
  kind: 'direct',
  bots: [],
  lastMessageAt: '2026-09-26T10:00:00.000Z',
  lastMessagePreview: '',
  unread: true,
  lastReadAt: '2026-09-26T09:00:00.000Z',
  hasActiveRoutine: false,
  ...over,
});

describe('firstNewMessageId', () => {
  const messages = [
    msg('m1', 'bot', '2026-09-26T08:00:00.000Z'),
    msg('m2', 'user', '2026-09-26T08:30:00.000Z'),
    msg('m3', 'user', '2026-09-26T09:30:00.000Z'),
    msg('m4', 'bot', '2026-09-26T09:31:00+00:00'),
    msg('m5', 'bot', '2026-09-26T09:32:00.000Z'),
  ];

  it('returns the first bot message newer than lastReadAt, skipping own messages', () => {
    expect(firstNewMessageId(messages, '2026-09-26T09:00:00.000Z')).toBe('m4');
  });

  it('compares instants, not strings (Postgres "+00:00" vs "Z")', () => {
    expect(firstNewMessageId(messages, '2026-09-26T09:31:00.000Z')).toBe('m5');
  });

  it('returns null when everything was read or lastReadAt is missing/invalid', () => {
    expect(firstNewMessageId(messages, '2026-09-26T10:00:00.000Z')).toBeNull();
    expect(firstNewMessageId(messages, null)).toBeNull();
    expect(firstNewMessageId(messages, 'nope')).toBeNull();
  });

  it('a proactive routine message after a read thread gets the divider', () => {
    const routine = [...messages, msg('r1', 'bot', '2026-09-27T06:41:05.000Z')];
    expect(firstNewMessageId(routine, '2026-09-26T10:00:00.000Z')).toBe('r1');
  });
});

describe('thread list patches', () => {
  it('markThreadReadIn clears unread and never moves lastReadAt backwards', () => {
    const list = [thread('a'), thread('b', { lastReadAt: '2026-09-26T12:00:00.000Z' })];
    const a = markThreadReadIn(list, 'a', '2026-09-26T11:00:00.000Z');
    expect(a[0]).toMatchObject({ unread: false, lastReadAt: '2026-09-26T11:00:00.000Z' });
    expect(a[1]).toBe(list[1]);
    const b = markThreadReadIn(list, 'b', '2026-09-26T11:00:00.000Z');
    expect(b[1].lastReadAt).toBe('2026-09-26T12:00:00.000Z');
  });

  it('mergeThreadIn replaces in place and appends unknown threads', () => {
    const list = [thread('a'), thread('b')];
    const merged = mergeThreadIn(list, thread('b', { hasActiveRoutine: true, topic: 'Meal prepping' }));
    expect(merged.map((t) => t.id)).toEqual(['a', 'b']);
    expect(merged[1]).toMatchObject({ hasActiveRoutine: true, topic: 'Meal prepping' });
    expect(mergeThreadIn(list, thread('c')).map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('formatSchedule', () => {
  it('matches the server labels', () => {
    expect(formatSchedule({ kind: 'weekly', weekday: 0, hour: 8, minute: 41, tz: 'Europe/Berlin' })).toBe('Sonntags · 08:41');
    expect(formatSchedule({ kind: 'daily', hour: 7, minute: 5, tz: 'Europe/Berlin' })).toBe('Täglich · 07:05');
  });
});

describe('loadSeq', () => {
  it('counts every finished first-page fetch, ok or failed', () => {
    let s = threadReducer(initialThreadState, { type: 'loaded', messages: [], hasMore: false });
    expect(s.loadSeq).toBe(1);
    s = threadReducer(s, { type: 'load_failed', code: 'network', message: 'x' });
    expect(s.loadSeq).toBe(2);
    expect(s.error).toBeNull();
  });
});
