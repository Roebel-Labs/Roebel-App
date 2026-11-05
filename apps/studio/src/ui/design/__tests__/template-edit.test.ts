import { describe, expect, it } from 'vitest';
import { applyNodeEdit, duplicateTemplate, insertAtCursor, removeNode, isProtectedNode } from '../edit';
import { STARTER_TEMPLATES } from '../../../render/templates';
import { initialState, showReducer } from '../../../state/reducer';

const lt = () => structuredClone(STARTER_TEMPLATES.find((t) => t.id === 'lower-third')!);

describe('applyNodeEdit', () => {
  it('clamps x/y, size and opacity', () => {
    let t = applyNodeEdit(lt(), 'title', { x: -50, y: 5000 });
    expect(t.nodes.find((n) => n.id === 'title')).toMatchObject({ x: 0, y: 1080 });
    t = applyNodeEdit(t, 'title', { x: 99999, y: -1, size: 2, opacity: 4 });
    expect(t.nodes.find((n) => n.id === 'title')).toMatchObject({ x: 1920, y: 0, size: 8, opacity: 1 });
    t = applyNodeEdit(t, 'title', { size: 9999, opacity: -1 });
    expect(t.nodes.find((n) => n.id === 'title')).toMatchObject({ size: 300, opacity: 0 });
  });
  it('does not mutate the input and keeps other nodes by reference', () => {
    const before = lt();
    const snap = structuredClone(before);
    const after = applyNodeEdit(before, 'title', { text: 'x' });
    expect(before).toEqual(snap);
    expect(after).not.toBe(before);
    expect(after.nodes.find((n) => n.id === 'bg')).toBe(before.nodes.find((n) => n.id === 'bg'));
  });
  it('ignores unknown node ids and non-finite numbers', () => {
    const t = lt();
    expect(applyNodeEdit(t, 'nope', { x: 1 })).toBe(t);
    const u = applyNodeEdit(t, 'title', { x: Number.NaN });
    expect(u.nodes.find((n) => n.id === 'title')!.x).toBe(t.nodes.find((n) => n.id === 'title')!.x);
  });
  it('never changes the node id', () => {
    const t = applyNodeEdit(lt(), 'title', { id: 'evil' } as never);
    expect(t.nodes.some((n) => n.id === 'evil')).toBe(false);
  });
});

describe('duplicateTemplate', () => {
  it('copies with a new id and " Kopie" name, deep', () => {
    const t = lt();
    const d = duplicateTemplate(t, 'copy-1');
    expect(d.id).toBe('copy-1');
    expect(d.name).toBe('Bauchbinde Kopie');
    expect(d.kind).toBe(t.kind);
    expect(d.nodes).toEqual(t.nodes);
    expect(d.nodes).not.toBe(t.nodes);
    expect(d.nodes[0]).not.toBe(t.nodes[0]);
    expect(t.id).toBe('lower-third');
  });
});

describe('removeNode / protection', () => {
  it('a duplicated ad template stays protected', () => {
    const ad = STARTER_TEMPLATES.find((t) => t.id === 'break-spot')!;
    const d = duplicateTemplate(ad, 'custom-1');
    expect(isProtectedNode(d, 'tag')).toBe(true);
    expect(removeNode(d, 'tag')).toBe(d);
  });
  it('protects the Werbung label of the break spot', () => {
    const ad = STARTER_TEMPLATES.find((t) => t.id === 'break-spot')!;
    expect(isProtectedNode(ad, 'tag')).toBe(true);
    expect(removeNode(ad, 'tag')).toBe(ad);
    expect(removeNode(ad, 'name').nodes.some((n) => n.id === 'name')).toBe(false);
  });
});

describe('insertAtCursor', () => {
  it('inserts at selection and returns the new caret', () => {
    expect(insertAtCursor('ab', 1, 1, '{{x}}')).toEqual({ value: 'a{{x}}b', caret: 6 });
    expect(insertAtCursor('abcd', 1, 3, 'Z')).toEqual({ value: 'aZd', caret: 2 });
  });
});

describe('template actions', () => {
  it('addTemplate appends and creates an overlay; removeTemplate drops both', () => {
    let s = initialState();
    const d = duplicateTemplate(lt(), 'copy-1');
    s = showReducer(s, { type: 'addTemplate', template: d });
    expect(s.templates.some((t) => t.id === 'copy-1')).toBe(true);
    expect(s.overlays.some((o) => o.templateId === 'copy-1')).toBe(true);
    s = showReducer(s, { type: 'removeTemplate', id: 'copy-1' });
    expect(s.templates.some((t) => t.id === 'copy-1')).toBe(false);
    expect(s.overlays.some((o) => o.templateId === 'copy-1')).toBe(false);
  });
  it('removeTemplate refuses starters; addTemplate refuses duplicate ids', () => {
    const s = initialState();
    expect(showReducer(s, { type: 'removeTemplate', id: 'clock' })).toBe(s);
    expect(showReducer(s, { type: 'addTemplate', template: lt() })).toBe(s);
  });
  it('resetTemplate restores a starter', () => {
    let s = initialState();
    const t = applyNodeEdit(s.templates.find((x) => x.id === 'clock')!, 'time', { text: 'XX' });
    s = showReducer(s, { type: 'updateTemplate', template: t });
    s = showReducer(s, { type: 'resetTemplate', id: 'clock' });
    expect(s.templates.find((x) => x.id === 'clock')).toEqual(STARTER_TEMPLATES.find((x) => x.id === 'clock'));
    expect(showReducer(s, { type: 'resetTemplate', id: 'unknown' })).toBe(s);
  });
});
