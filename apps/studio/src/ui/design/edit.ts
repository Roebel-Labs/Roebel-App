import type { Template, TemplateNode } from '../../state/types';

const FRAME_W = 1920;
const FRAME_H = 1080;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Drops non-finite numbers so a half-typed field never corrupts a node. */
function sanitize(patch: Partial<TemplateNode>): Partial<TemplateNode> {
  const out: Record<string, unknown> = { ...patch };
  delete out.id;
  delete out.type;
  for (const k of ['x', 'y', 'w', 'h', 'size', 'opacity', 'radius', 'delayMs'] as const) {
    const v = out[k];
    if (v !== undefined && !(typeof v === 'number' && Number.isFinite(v))) delete out[k];
  }
  if (typeof out.x === 'number') out.x = clamp(out.x, 0, FRAME_W);
  if (typeof out.y === 'number') out.y = clamp(out.y, 0, FRAME_H);
  if (typeof out.size === 'number') out.size = clamp(out.size, 8, 300);
  if (typeof out.opacity === 'number') out.opacity = clamp(out.opacity, 0, 1);
  if (typeof out.w === 'number') out.w = clamp(out.w, 0, FRAME_W);
  if (typeof out.h === 'number') out.h = clamp(out.h, 0, FRAME_H);
  if (typeof out.delayMs === 'number') out.delayMs = Math.max(0, out.delayMs);
  if (typeof out.radius === 'number') out.radius = Math.max(0, out.radius);
  return out as Partial<TemplateNode>;
}

/** Pure: returns a new template with the node patched (clamped); unknown node ids return the input. */
export function applyNodeEdit(t: Template, nodeId: string, patch: Partial<TemplateNode>): Template {
  if (!t.nodes.some((n) => n.id === nodeId)) return t;
  const clean = sanitize(patch);
  return { ...t, nodes: t.nodes.map((n) => (n.id === nodeId ? { ...n, ...clean } : n)) };
}

export function duplicateTemplate(t: Template, newId: string): Template {
  return { ...structuredClone(t), id: newId, name: `${t.name} Kopie`, kind: 'custom' };
}

/** The ad template must always keep its "Werbung" label. */
export function isProtectedNode(t: Template, nodeId: string): boolean {
  return t.kind === 'breakSpot' && (nodeId === 'tag' || nodeId === 'tag-bg');
}

export function removeNode(t: Template, nodeId: string): Template {
  if (isProtectedNode(t, nodeId) || !t.nodes.some((n) => n.id === nodeId)) return t;
  return { ...t, nodes: t.nodes.filter((n) => n.id !== nodeId) };
}

export function insertAtCursor(value: string, start: number, end: number, insert: string): { value: string; caret: number } {
  const a = clamp(Math.min(start, end), 0, value.length);
  const b = clamp(Math.max(start, end), 0, value.length);
  return { value: value.slice(0, a) + insert + value.slice(b), caret: a + insert.length };
}
