jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));

import { consumeSSEResponse, parseSSEChunk, type ChatStreamEvent } from '../stream';

const msg = (id: string) => ({
  id,
  threadId: 't1',
  role: 'bot',
  botId: 'b1',
  parts: [{ type: 'text', text: 'Hi' }],
  replyTo: null,
  reactions: {},
  createdAt: '2026-09-25T10:00:00.000Z',
});

describe('parseSSEChunk', () => {
  it('parses complete frames in order and keeps the incomplete tail', () => {
    const buf =
      'event: bot_start\ndata: {"botId":"b1","messageId":"m1"}\n\n' +
      'event: delta\ndata: {"messageId":"m1","text":"Hal"}\n\n' +
      'event: delta\ndata: {"messageId":"m1",';
    const { events, rest } = parseSSEChunk(buf);
    expect(events).toEqual([
      { type: 'bot_start', botId: 'b1', messageId: 'm1' },
      { type: 'delta', messageId: 'm1', text: 'Hal' },
    ]);
    expect(rest).toBe('event: delta\ndata: {"messageId":"m1",');
    const next = parseSSEChunk(`${rest}"text":"lo"}\n\n`);
    expect(next.events).toEqual([{ type: 'delta', messageId: 'm1', text: 'lo' }]);
    expect(next.rest).toBe('');
  });

  it('handles CRLF, comments, multi-line data and no space after the colon', () => {
    const buf = ': keep-alive\r\n\r\nevent:part\r\ndata:{"messageId":"m1",\r\ndata:"part":{"type":"text","text":"x"}}\r\n\r\n';
    const { events, rest } = parseSSEChunk(buf);
    expect(events).toEqual([{ type: 'part', messageId: 'm1', part: { type: 'text', text: 'x' } }]);
    expect(rest).toBe('');
  });

  it('skips unknown events and malformed JSON', () => {
    const buf = 'event: ping\ndata: {}\n\nevent: delta\ndata: not-json\n\ndata: {"a":1}\n\n';
    expect(parseSSEChunk(buf).events).toEqual([]);
  });

  it('normalises error events with German fallback copy', () => {
    const { events } = parseSSEChunk('event: error\ndata: {"code":"quota"}\n\n');
    expect(events).toEqual([{ type: 'error', code: 'quota', message: 'Es ist ein Fehler aufgetreten.' }]);
  });

  it('parses user / bot_done / done payloads', () => {
    const buf =
      `event: user\ndata: ${JSON.stringify({ message: msg('u1') })}\n\n` +
      `event: bot_done\ndata: ${JSON.stringify({ message: msg('m1') })}\n\n` +
      `event: done\ndata: ${JSON.stringify({ thread: { id: 't1' } })}\n\n`;
    const types = parseSSEChunk(buf).events.map((e) => e.type);
    expect(types).toEqual(['user', 'bot_done', 'done']);
  });
});

describe('consumeSSEResponse', () => {
  const full =
    'event: bot_start\ndata: {"botId":"b1","messageId":"m1"}\n\n' +
    'event: delta\ndata: {"messageId":"m1","text":"Grüß dich"}\n\n' +
    'event: done\ndata: {"thread":{"id":"t1"}}\n\n';

  it('reads a streaming body split mid-frame and mid-UTF-8 sequence', async () => {
    const bytes = new TextEncoder().encode(full);
    // Split inside the two-byte "ü" to exercise the streaming decoder.
    const cut = new TextEncoder().encode(full.slice(0, full.indexOf('ü'))).length + 1;
    const chunks = [bytes.slice(0, 20), bytes.slice(20, cut), bytes.slice(cut)];
    let i = 0;
    const res = {
      body: { getReader: () => ({ read: async () => (i < chunks.length ? { done: false, value: chunks[i++] } : { done: true }) }) },
      text: async () => '',
    };
    const events: ChatStreamEvent[] = [];
    const terminal = await consumeSSEResponse(res, (e) => events.push(e));
    expect(terminal).toBe(true);
    expect(events.map((e) => e.type)).toEqual(['bot_start', 'delta', 'done']);
    expect(events[1]).toEqual({ type: 'delta', messageId: 'm1', text: 'Grüß dich' });
  });

  it('falls back to full text when there is no reader, and reports a missing terminal event', async () => {
    const events: ChatStreamEvent[] = [];
    const truncated = full.slice(0, full.indexOf('event: done'));
    const terminal = await consumeSSEResponse({ body: null, text: async () => truncated }, (e) => events.push(e));
    expect(terminal).toBe(false);
    expect(events.map((e) => e.type)).toEqual(['bot_start', 'delta']);
  });

  it('flushes a final frame without the trailing blank line', async () => {
    const events: ChatStreamEvent[] = [];
    const terminal = await consumeSSEResponse(
      { body: null, text: async () => 'event: error\ndata: {"code":"x","message":"Kaputt"}' },
      (e) => events.push(e),
    );
    expect(terminal).toBe(true);
    expect(events).toEqual([{ type: 'error', code: 'x', message: 'Kaputt' }]);
  });
});
