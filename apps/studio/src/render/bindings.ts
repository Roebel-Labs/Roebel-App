import type { RenderContext } from '../state/types';

const BINDING = /\{\{\s*([^{}]*?)\s*\}\}/g;
const pad2 = (n: number) => String(n).padStart(2, '0');

/** Resolves one binding key (e.g. `row.Gruppe`). Unknown or missing keys resolve to ''. */
function lookup(key: string, rc: RenderContext): string {
  if (key === 'time') return `${pad2(rc.now.getHours())}:${pad2(rc.now.getMinutes())}`;
  if (key === 'date') return `${pad2(rc.now.getDate())}.${pad2(rc.now.getMonth() + 1)}.${rc.now.getFullYear()}`;
  const dot = key.indexOf('.');
  if (dot < 0) return '';
  const scope = key.slice(0, dot);
  const field = key.slice(dot + 1);
  let value: unknown;
  switch (scope) {
    case 'row':
      value = rc.row?.[field];
      break;
    case 'next':
      value = rc.next?.[field];
      break;
    case 'sponsor':
      value = field === 'logo' ? rc.sponsor?.logoUrl : field === 'name' ? rc.sponsor?.name : undefined;
      break;
    case 'chat':
      value =
        field === 'name' ? rc.chatHighlight?.name : field === 'body' ? rc.chatHighlight?.body : field === 'avatar' ? rc.chatHighlight?.avatarUrl : undefined;
      break;
  }
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
}

// Separators that join bindings in a line ("{{row.Verein}} · {{row.Kategorie}}").
const SEP = '[·•–—|]';
const REPEATED_SEP = new RegExp(`(\\s*${SEP})(?:\\s*${SEP})+`, 'g');
const EDGE_SEP = new RegExp(`^\\s*${SEP}\\s*|\\s*${SEP}\\s*$`, 'g');

/**
 * Replaces every `{{key}}` in `text`. Never returns a literal `{{…}}` or `undefined`.
 * When a binding resolves empty, separators it leaves dangling at the ends or doubled are removed,
 * so "{{row.Verein}} · {{row.Kategorie}}" with no category reads "TSV Röbel", not "TSV Röbel ·".
 */
export function resolveBindings(text: string, rc: RenderContext): string {
  if (!text || text.indexOf('{{') < 0) return text ?? '';
  let anyEmpty = false;
  const out = text.replace(BINDING, (_, key: string) => {
    const v = lookup(key, rc);
    if (!v) anyEmpty = true;
    return v;
  });
  if (!anyEmpty) return out;
  return out.replace(REPEATED_SEP, '$1').replace(EDGE_SEP, '').trim();
}
