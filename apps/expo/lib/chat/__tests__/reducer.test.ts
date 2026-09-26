import { initialThreadState, messagePreview, threadReducer, type ThreadAction, type ThreadState } from '../reducer';
import type { ChatMessage } from '../types';

const m = (id: string, over: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  threadId: 't1',
  role: 'bot',
  botId: 'b1',
  parts: [{ type: 'text', text: `text ${id}` }],
  replyTo: null,
  reactions: {},
  createdAt: `2026-09-25T10:00:0${id.replace(/\D/g, '') || '0'}.000Z`,
  ...over,
});

const run = (state: ThreadState, ...actions: ThreadAction[]) => actions.reduce(threadReducer, state);
const loaded = (msgs: ChatMessage[], hasMore = false) => run(initialThreadState, { type: 'loaded', messages: msgs, hasMore });
const send = (text: string, extra: Partial<Extract<ThreadAction, { type: 'send_optimistic' }>> = {}): ThreadAction => ({
  type: 'send_optimistic',
  tempId: 'temp-1',
  threadId: 't1',
  body: { text },
  createdAt: '2026-09-25T10:00:09.000Z',
  ...extra,
});

describe('threadReducer', () => {
  it('loads and prepends older pages without duplicates', () => {
    const s = run(loaded([m('m3'), m('m4')], true), {
      type: 'older_loaded',
      messages: [m('m2'), m('m1'), m('m3')],
      hasMore: false,
    });
    expect(s.messages.map((x) => x.id)).toEqual(['m1', 'm2', 'm3', 'm4']);
    expect(s.hasMore).toBe(false);
    expect(s.loadingOlder).toBe(false);
  });

  it('adds an optimistic user message with reply preview and replaces it on the user event', () => {
    let s = run(loaded([m('m1')]), send('Hallo', { body: { text: 'Hallo', replyToId: 'm1' }, localImageUris: ['file:///a.jpg'] }));
    expect(s.messages[1]).toMatchObject({
      id: 'temp-1',
      role: 'user',
      parts: [{ type: 'image', url: 'file:///a.jpg' }, { type: 'text', text: 'Hallo' }],
      replyTo: { id: 'm1', preview: 'text m1' },
    });
    expect(s.streaming).toEqual({ botId: null, messageId: null });
    s = run(s, { type: 'stream_event', event: { type: 'user', message: m('u2', { role: 'user', botId: null }) } });
    expect(s.messages.map((x) => x.id)).toEqual(['m1', 'u2']);
    expect(s.pendingTempId).toBeNull();
  });

  it('assembles a streaming bot message from deltas and parts, then finalizes', () => {
    let s = run(
      loaded([m('m1')]),
      send('Frage'),
      { type: 'stream_event', event: { type: 'user', message: m('u2', { role: 'user', botId: null }) } },
      { type: 'stream_event', event: { type: 'bot_start', botId: 'b1', messageId: 'm3' } },
      { type: 'stream_event', event: { type: 'delta', messageId: 'm3', text: 'Guten ' } },
      { type: 'stream_event', event: { type: 'delta', messageId: 'm3', text: 'Tag' } },
      {
        type: 'stream_event',
        event: { type: 'part', messageId: 'm3', part: { type: 'options', question: 'Welche?', options: [{ key: 'A', label: 'Eins' }] } },
      },
    );
    expect(s.streaming).toEqual({ botId: 'b1', messageId: 'm3' });
    const bot = s.messages.find((x) => x.id === 'm3')!;
    expect(bot.parts[0]).toEqual({ type: 'text', text: 'Guten Tag' });
    expect(bot.parts[1].type).toBe('options');
    const final = m('m3', { parts: [{ type: 'text', text: 'Guten Tag!' }] });
    s = run(s, { type: 'stream_event', event: { type: 'bot_done', message: final } });
    expect(s.messages.find((x) => x.id === 'm3')).toEqual(final);
    expect(s.streaming).toEqual({ botId: null, messageId: null });
    s = run(s, { type: 'stream_event', event: { type: 'done', thread: {} as never } });
    expect(s.streaming).toBeNull();
    expect(s.lastSend).toBeNull();
  });

  it('keeps a retry payload on error, drops an empty bot bubble, and a retry replaces the failed message', () => {
    let s = run(
      loaded([m('m1')]),
      send('Hi', { body: { text: 'Hi', mentionBotIds: ['b2'] } }),
      { type: 'stream_event', event: { type: 'bot_start', botId: 'b1', messageId: 'm3' } },
      { type: 'stream_event', event: { type: 'error', code: 'quota', message: 'Limit erreicht' } },
    );
    expect(s.streaming).toBeNull();
    expect(s.error).toEqual({ code: 'quota', message: 'Limit erreicht', retry: { text: 'Hi', mentionBotIds: ['b2'] } });
    expect(s.messages.map((x) => x.id)).toEqual(['m1', 'temp-1']);
    s = run(s, send('Hi', { tempId: 'temp-2' }));
    expect(s.messages.map((x) => x.id)).toEqual(['m1', 'temp-2']);
    expect(s.error).toBeNull();
  });

  it('send_failed keeps the bubble; discard_failed removes it', () => {
    let s = run(loaded([]), send('Bild'), { type: 'send_failed', code: 'network', message: 'Offline', body: { text: 'Bild' } });
    expect(s.error?.retry).toEqual({ text: 'Bild' });
    expect(s.messages).toHaveLength(1);
    s = run(s, { type: 'discard_failed' });
    expect(s.messages).toHaveLength(0);
    expect(s.error).toBeNull();
  });

  it('keeps the optimistic tail when a page reload lands mid-stream', () => {
    const s = run(loaded([m('m1')]), send('x'), { type: 'loaded', messages: [m('m1'), m('m2')], hasMore: false });
    expect(s.messages.map((x) => x.id)).toEqual(['m1', 'm2', 'temp-1']);
  });

  it('handles reactions, option answers and dismissals', () => {
    const opt = m('m1', {
      parts: [{ type: 'options', question: 'Q', options: [{ key: 'A', label: 'a' }, { key: 'B', label: 'b' }] }],
    });
    let s = run(
      loaded([opt, m('m2')]),
      { type: 'react_optimistic', messageId: 'm2', emoji: '👍' },
      { type: 'react_optimistic', messageId: 'm2', emoji: '👍' },
    );
    expect(s.messages[1].reactions).toEqual({ '👍': 2 });
    s = run(s, { type: 'reactions', messageId: 'm2', reactions: { '❤️': 1 } });
    expect(s.messages[1].reactions).toEqual({ '❤️': 1 });
    s = run(s, { type: 'option_answered', messageId: 'm1', key: 'B' });
    expect(s.messages[0].parts[0]).toMatchObject({ type: 'options', selected: 'B' });
    s = run(s, { type: 'dismiss_options', messageId: 'm1' });
    expect(s.messages[0].parts[0]).toMatchObject({ dismissed: true });
    const unchanged = run(s, { type: 'reactions', messageId: 'nope', reactions: {} });
    expect(unchanged).toBe(s);
  });

  it('load_failed only sets an error before the first page', () => {
    const s = run(initialThreadState, { type: 'load_failed', code: 'network', message: 'Offline' });
    expect(s.loaded).toBe(true);
    expect(s.error).toEqual({ code: 'network', message: 'Offline', retry: null });
    const later = run(s, { type: 'loaded', messages: [m('m1')], hasMore: false });
    expect(later.error).toBeNull();
  });
});

describe('messagePreview', () => {
  it('flattens whitespace and truncates', () => {
    expect(messagePreview(m('m1', { parts: [{ type: 'text', text: 'a\n\n b' }] }))).toBe('a b');
    expect(messagePreview(m('m1', { parts: [{ type: 'text', text: 'x'.repeat(100) }] }), 10)).toBe(`${'x'.repeat(9)}…`);
    expect(messagePreview(m('m1', { parts: [{ type: 'image', url: 'u' }] }))).toBe('Bild');
  });
});

describe('threadReducer · approvals (agent harness)', () => {
  type ApprovalPart = Extract<ChatMessage['parts'][number], { type: 'approval' }>;
  const approval = (over: Partial<ApprovalPart> = {}): ApprovalPart => ({
    type: 'approval',
    actionId: 'a1',
    tool: 'create_feed_post',
    risk: 'public',
    title: 'Beitrag veröffentlichen',
    summary: 'Beitrag im Röbel-Feed veröffentlichen',
    preview: { kind: 'post', fields: [], body: 'Hallo Röbel' },
    status: 'pending',
    canAlwaysAllow: true,
    ...over,
  });
  const withApproval = () =>
    loaded([m('m1'), m('m2', { parts: [{ type: 'text', text: 'Soll ich?' }, approval()] })]);
  const partOf = (s: ThreadState) => s.messages[1].parts[1] as ApprovalPart;

  it('sets the approval status by actionId and keeps other parts', () => {
    const s = run(withApproval(), { type: 'approval_status', actionId: 'a1', status: 'approved' });
    expect(partOf(s).status).toBe('approved');
    expect(s.messages[1].parts[0]).toEqual({ type: 'text', text: 'Soll ich?' });
  });

  it('stores a result note with the status', () => {
    const s = run(withApproval(), { type: 'approval_status', actionId: 'a1', status: 'failed', resultNote: 'Zu lang' });
    expect(partOf(s)).toMatchObject({ status: 'failed', resultNote: 'Zu lang' });
  });

  it('is a no-op for an unknown actionId', () => {
    const before = withApproval();
    expect(run(before, { type: 'approval_status', actionId: 'nope', status: 'rejected' })).toBe(before);
  });

  it('continuation_start opens a stream without an optimistic user message', () => {
    const s = run(withApproval(), { type: 'continuation_start' });
    expect(s.streaming).toEqual({ botId: null, messageId: null });
    expect(s.pendingTempId).toBeNull();
    expect(s.messages).toHaveLength(2);
  });

  it('streams a continuation reply and ends on done', () => {
    let s = run(
      withApproval(),
      { type: 'approval_status', actionId: 'a1', status: 'approved' },
      { type: 'continuation_start' },
      { type: 'stream_event', event: { type: 'bot_start', botId: 'b1', messageId: 'm3' } },
      { type: 'stream_event', event: { type: 'delta', messageId: 'm3', text: 'Erledigt.' } },
    );
    expect(s.messages.map((x) => x.id)).toEqual(['m1', 'm2', 'm3']);
    expect(s.streaming).toEqual({ botId: 'b1', messageId: 'm3' });
    s = run(s, {
      type: 'stream_event',
      event: { type: 'done', thread: {} as unknown as import('../types').ChatThread },
    });
    expect(s.streaming).toBeNull();
    expect(s.error).toBeNull();
  });

  it('a continuation error sets a non-retryable error', () => {
    const s = run(withApproval(), { type: 'continuation_start' }, {
      type: 'stream_event',
      event: { type: 'error', code: 'expired', message: 'Die Freigabe ist abgelaufen.' },
    });
    expect(s.streaming).toBeNull();
    expect(s.error).toEqual({ code: 'expired', message: 'Die Freigabe ist abgelaufen.', retry: null });
  });

  it('a streamed approval part with a known actionId updates in place instead of appending', () => {
    const s = run(
      withApproval(),
      { type: 'continuation_start' },
      { type: 'stream_event', event: { type: 'bot_start', botId: 'b1', messageId: 'm3' } },
      {
        type: 'stream_event',
        event: { type: 'part', messageId: 'm3', part: approval({ status: 'executed', resultNote: 'Veröffentlicht' }) },
      },
    );
    expect(partOf(s)).toMatchObject({ status: 'executed', resultNote: 'Veröffentlicht' });
    expect(s.messages[2].parts).toEqual([]);
  });

  it('a new approval part is appended to the streaming message', () => {
    const s = run(
      withApproval(),
      { type: 'continuation_start' },
      { type: 'stream_event', event: { type: 'bot_start', botId: 'b1', messageId: 'm3' } },
      { type: 'stream_event', event: { type: 'part', messageId: 'm3', part: approval({ actionId: 'a2' }) } },
    );
    expect(s.messages[2].parts).toHaveLength(1);
    expect(partOf(s).status).toBe('pending');
  });

  it('task parts update in place by taskId', () => {
    const task = (status: 'running' | 'done') => ({
      type: 'task' as const,
      taskId: 't1',
      title: 'Recherche',
      status,
      steps: [{ label: 'Suchen', status: status === 'done' ? ('done' as const) : ('running' as const) }],
    });
    const s = run(
      loaded([m('m1', { parts: [task('running')] })]),
      { type: 'continuation_start' },
      { type: 'stream_event', event: { type: 'bot_start', botId: 'b1', messageId: 'm2' } },
      { type: 'stream_event', event: { type: 'part', messageId: 'm2', part: task('done') } },
    );
    expect(s.messages[0].parts[0]).toMatchObject({ status: 'done' });
    expect(s.messages[1].parts).toEqual([]);
  });

  it('previews approvals by title', () => {
    expect(messagePreview(m('m9', { parts: [approval()] }))).toBe('Beitrag veröffentlichen');
  });
});
