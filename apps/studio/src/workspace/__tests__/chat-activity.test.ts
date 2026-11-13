import { describe, expect, it } from 'vitest';
import { activeEntry, activityLabel, outlineEntries } from '../chat-activity';
import type { ChatMessage, ChatPart } from '../types';

const msg = (id: string, role: ChatMessage['role'], parts: ChatPart[]): ChatMessage => ({
  id,
  threadId: 't',
  role,
  botId: null,
  parts,
  replyTo: null,
  reactions: {},
  createdAt: '2026-11-13T12:00:00Z',
});

describe('activityLabel', () => {
  it('thinks before any part arrives', () => {
    expect(activityLabel({ parts: [] })).toBe('Denkt nach');
    expect(activityLabel(null)).toBe('Denkt nach');
  });
  it('writes while text streams', () => {
    expect(activityLabel({ parts: [{ type: 'text', text: 'Hallo' }] })).toBe('Schreibt die Antwort');
  });
  it('names a generating image', () => {
    expect(activityLabel({ parts: [{ type: 'text', text: 'Ok' }, { type: 'generated_image', imageId: 'i', status: 'generating', prompt: 'p' }] })).toBe('Erstellt ein Bild');
  });
  it('uses the running task step', () => {
    const task: ChatPart = {
      type: 'task',
      taskId: 'x',
      title: 'Maskottchen',
      status: 'running',
      steps: [
        { label: 'Skizzen', status: 'done' },
        { label: 'Entwirft neue Maskottchen', status: 'running' },
      ],
    };
    expect(activityLabel({ parts: [task, { type: 'text', text: 'x' }] })).toBe('Entwirft neue Maskottchen');
  });
  it('skips finished tasks', () => {
    const task: ChatPart = { type: 'task', taskId: 'x', title: 'Fertig', status: 'done', steps: [] };
    expect(activityLabel({ parts: [task, { type: 'text', text: 'x' }] })).toBe('Schreibt die Antwort');
  });
});

describe('outlineEntries', () => {
  it('lists only persisted user turns with flattened previews', () => {
    const list = outlineEntries(
      [
        msg('u1', 'user', [{ type: 'text', text: 'Hier ist\n\nein Sheet' }]),
        msg('b1', 'bot', [{ type: 'text', text: 'Antwort' }]),
        msg('u2', 'user', [{ type: 'image', url: 'https://x/y.png' }]),
        msg('local-1', 'user', [{ type: 'text', text: 'pending' }]),
      ],
      'Max',
    );
    expect(list.map((e) => e.id)).toEqual(['u1', 'u2']);
    expect(list[0]).toMatchObject({ author: 'Max', preview: 'Hier ist ein Sheet' });
    expect(list[1].preview).toBe('Bild');
  });
});

describe('activeEntry', () => {
  it('picks the last entry above the reading line', () => {
    expect(activeEntry([], 0, 900)).toBe(-1);
    expect(activeEntry([0, 500, 1200], 0, 900)).toBe(0);
    expect(activeEntry([0, 500, 1200], 300, 900)).toBe(1);
    expect(activeEntry([0, 500, 1200], 1000, 900)).toBe(2);
  });
});
