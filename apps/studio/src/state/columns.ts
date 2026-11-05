import type { Template } from './types';

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const refPattern = (column: string) => new RegExp(`\\{\\{(\\s*)(row|next)\\.${esc(column)}(\\s*)\\}\\}`, 'g');

/** Rewrites `{{row.Old}}` / `{{next.Old}}` to the new column name in one text. */
export function renameBinding(text: string, from: string, to: string): string {
  return text.replace(refPattern(from), (_m, a: string, scope: string, b: string) => `{{${a}${scope}.${to}${b}}}`);
}

export function renameInTemplates(templates: Template[], from: string, to: string): Template[] {
  return templates.map((t) => {
    if (!t.nodes.some((n) => n.text !== undefined && renameBinding(n.text, from, to) !== n.text)) return t;
    return { ...t, nodes: t.nodes.map((n) => (n.text === undefined ? n : { ...n, text: renameBinding(n.text, from, to) })) };
  });
}

/** Names of templates whose text nodes bind to the given column. */
export function templatesUsingColumn(templates: Template[], column: string): string[] {
  return templates.filter((t) => t.nodes.some((n) => n.text !== undefined && new RegExp(refPattern(column).source).test(n.text))).map((t) => t.name);
}
