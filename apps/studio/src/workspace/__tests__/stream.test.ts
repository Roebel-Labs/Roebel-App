import { describe, expect, it } from 'vitest';
import { parseSSEChunk } from '../sse';
import { applyEvent, emptyThread, optimisticUser } from '../thread-state';
import type { ChatMessage } from '../types';

const msg = (id: string, role: 'user' | 'bot', text: string): ChatMessage => ({
  id, threadId: 't', role, botId: role === 'bot' ? 'b' : null, parts: [{ type: 'text', text }], replyTo: null, reactions: {}, createdAt: '2026-11-12T12:00:00Z',
});

describe('parseSSEChunk', () => {
  it('parses complete frames and keeps the tail', () => {
    const { events, rest } = parseSSEChunk('event: delta\ndata: {"messageId":"m","text":"Hal"}\n\nevent: delta\r\ndata: {"messageId":"m"');
    expect(events).toEqual([{ type: 'delta', messageId: 'm', text: 'Hal' }]);
    expect(rest).toBe('event: delta\ndata: {"messageId":"m"');
  });
  it('skips comments, unknown events and broken json', () => {
    const { events } = parseSSEChunk(': ping\n\nevent: nope\ndata: {}\n\nevent: delta\ndata: {broken\n\nevent: error\ndata: {"code":"quota"}\n\n');
    expect(events).toEqual([{ type: 'error', code: 'quota', message: 'Es ist ein Fehler aufgetreten.' }]);
  });
});

describe('applyEvent', () => {
  it('replaces the local echo and streams a bot reply', () => {
    let v = { ...emptyThread, messages: [optimisticUser('t', 'Hi', new Date(1))] };
    v = applyEvent(v, 't', { type: 'user', message: msg('u1', 'user', 'Hi') });
    expect(v.messages.map((m) => m.id)).toEqual(['u1']);
    v = applyEvent(v, 't', { type: 'bot_start', botId: 'b', messageId: 'm1' });
    v = applyEvent(v, 't', { type: 'delta', messageId: 'm1', text: 'Hal' });
    v = applyEvent(v, 't', { type: 'delta', messageId: 'm1', text: 'lo' });
    expect(v.messages[1].parts).toEqual([{ type: 'text', text: 'Hallo' }]);
    expect(v.streaming).toEqual(['m1']);
    v = applyEvent(v, 't', { type: 'bot_done', message: msg('m1', 'bot', 'Hallo!') });
    expect(v.streaming).toEqual([]);
    expect((v.messages[1].parts[0] as { text: string }).text).toBe('Hallo!');
  });
  it('records errors and stops streaming', () => {
    let v = applyEvent(emptyThread, 't', { type: 'bot_start', botId: 'b', messageId: 'm1' });
    v = applyEvent(v, 't', { type: 'error', code: 'quota', message: 'Kontingent aufgebraucht' });
    expect(v.streaming).toEqual([]);
    expect(v.error).toBe('Kontingent aufgebraucht');
  });
});
