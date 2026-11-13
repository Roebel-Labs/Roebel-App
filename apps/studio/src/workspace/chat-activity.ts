// Pure helpers for the agent activity bar above the composer and the chat outline (section minimap).
import { messageText } from './briefing-format';
import type { ChatMessage, ChatPart } from './types';

type TaskPart = Extract<ChatPart, { type: 'task' }>;

/**
 * What the assistant is doing right now, read from the parts of its streaming message. The stream has no
 * explicit activity events, so the parts are the signal: a running task step, an image being generated,
 * text arriving, or nothing yet.
 */
export function activityLabel(message: Pick<ChatMessage, 'parts'> | null | undefined): string {
  const parts = message?.parts ?? [];
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    if (p.type === 'generated_image' && (p as { status?: string }).status === 'generating') return 'Erstellt ein Bild';
    if (p.type === 'task') {
      const t = p as TaskPart;
      if (t.status === 'done' || t.status === 'failed' || t.status === 'cancelled') continue;
      if (t.status === 'waiting_approval') return 'Wartet auf deine Freigabe';
      const step = t.steps.find((s) => s.status === 'running') ?? t.steps.find((s) => s.status === 'pending');
      return (step?.label || t.title || 'Arbeitet an der Aufgabe').trim();
    }
  }
  const last = parts[parts.length - 1];
  if (!last) return 'Denkt nach';
  if (last.type === 'text') return 'Schreibt die Antwort';
  return 'Bereitet die Antwort vor';
}

export interface OutlineEntry {
  id: string;
  author: string;
  preview: string;
}

function fallbackPreview(parts: ChatPart[]): string {
  if (parts.some((p) => p.type === 'image' || p.type === 'generated_image')) return 'Bild';
  if (parts.some((p) => p.type === 'file')) return 'Datei';
  if (parts.some((p) => p.type === 'task')) return 'Aufgabe';
  return 'Nachricht';
}

/**
 * One outline entry per message, the person's and the assistant's, like headings in a document.
 * Local echoes and replies still empty while streaming are left out; messages without text (an image
 * only) get a neutral label.
 */
export function outlineEntries(messages: ChatMessage[], me: string, botName: (m: ChatMessage) => string): OutlineEntry[] {
  return messages
    .filter((m) => (m.role === 'user' || m.role === 'bot') && !m.id.startsWith('local-') && m.parts.length > 0)
    .map((m) => ({
      id: m.id,
      author: m.role === 'user' ? me : botName(m),
      preview: messageText(m.parts).replace(/\s+/g, ' ').trim() || fallbackPreview(m.parts),
    }));
}

/**
 * The entry the reader is in: the last one whose top has scrolled above a line a third down the viewport.
 * `tops` are the entries' offsets inside the scroller, in entry order.
 */
export function activeEntry(tops: number[], scrollTop: number, viewport: number): number {
  if (tops.length === 0) return -1;
  const line = scrollTop + viewport / 3;
  let active = 0;
  for (let i = 0; i < tops.length; i++) if (tops[i] <= line) active = i;
  return active;
}
