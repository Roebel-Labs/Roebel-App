import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TEMPLATES, updateLayer, type CardDesign } from '@roebel/card-design';
import { CredentialsApiError } from '../api';
import { HISTORY_LIMIT, createAutosaver, editorReducer, initEditor, type SaveStatus } from '../designer/state';
import type { DraftView, DraftWithDesign } from '../types';

const base = TEMPLATES.find((x) => x.id === 'schwarz')!.design;
const retitle = (text: string) => (d: CardDesign) => updateLayer(d, 'title', { text });
const title = (d: CardDesign) => (d.layers.find((l) => l.id === 'title') as { text: string }).text;

describe('editor reducer', () => {
  it('undo after two applies restores the first design, redo goes forward again', () => {
    let s = initEditor(base, 1);
    s = editorReducer(s, { type: 'apply', fn: retitle('Eins') });
    s = editorReducer(s, { type: 'apply', fn: retitle('Zwei') });
    expect(title(s.design)).toBe('Zwei');
    s = editorReducer(s, { type: 'undo' });
    expect(title(s.design)).toBe('Eins');
    s = editorReducer(s, { type: 'undo' });
    expect(s.design).toBe(base);
    s = editorReducer(s, { type: 'redo' });
    expect(title(s.design)).toBe('Eins');
  });

  it('a new apply clears redo', () => {
    let s = initEditor(base, 1);
    s = editorReducer(s, { type: 'apply', fn: retitle('Eins') });
    s = editorReducer(s, { type: 'undo' });
    expect(s.future).toHaveLength(1);
    s = editorReducer(s, { type: 'apply', fn: retitle('Drei') });
    expect(s.future).toHaveLength(0);
    expect(editorReducer(s, { type: 'redo' })).toBe(s);
  });

  it('caps the history at 100 steps', () => {
    let s = initEditor(base, 1);
    for (let i = 0; i < 130; i++) s = editorReducer(s, { type: 'apply', fn: retitle(`T${i}`) });
    expect(HISTORY_LIMIT).toBe(100);
    expect(s.past).toHaveLength(100);
  });

  it('one drag (same key) is one undo step', () => {
    let s = initEditor(base, 1);
    for (let x = 0; x < 10; x++) s = editorReducer(s, { type: 'apply', fn: (d) => updateLayer(d, 'title', { x }), key: 'drag-1' });
    expect(s.past).toHaveLength(1);
    s = editorReducer(s, { type: 'undo' });
    expect(s.design).toBe(base);
  });

  it('drops the selection when the selected layer disappears, and marks saves', () => {
    let s = initEditor(base, 1);
    s = editorReducer(s, { type: 'select', id: 'title' });
    expect(s.selected).toBe('title');
    s = editorReducer(s, { type: 'apply', fn: (d) => ({ ...d, layers: d.layers.filter((l) => l.id !== 'title') }) });
    expect(s.selected).toBeNull();
    expect(s.dirty).toBe(true);
    s = editorReducer(s, { type: 'saved', revision: 2, design: s.design });
    expect(s).toMatchObject({ dirty: false, revision: 2 });
  });

  it('replace loads another version and clears the history', () => {
    let s = initEditor(base, 1);
    s = editorReducer(s, { type: 'apply', fn: retitle('Eins') });
    const other = TEMPLATES[0].design;
    s = editorReducer(s, { type: 'replace', design: other, revision: 9 });
    expect(s).toMatchObject({ design: other, revision: 9, dirty: false, past: [], future: [], selected: null });
  });
});

describe('autosave', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const view = (revision: number): DraftView => ({
    id: 'd1', name: 'Mitglied', kind: 'membership', template: null, typeId: null, revision, updatedAt: '', liveVersion: null,
    pendingVersion: null, hasUnpublishedChanges: true, testSentAt: null,
  });

  function setup(save: (doc: string, rev: number | null) => Promise<DraftView>, revision: number | null = 3) {
    const statuses: SaveStatus[] = [];
    const conflicts: DraftWithDesign[] = [];
    const saved: [DraftView, string][] = [];
    const saver = createAutosaver<string>({
      save, delayMs: 2000, revision,
      onStatus: (s) => statuses.push(s),
      onSaved: (v, d) => saved.push([v, d]),
      onConflict: (d) => conflicts.push(d),
    });
    return { saver, statuses, conflicts, saved };
  }

  it('fires once, 2 s after the last of several rapid changes, with the base revision', async () => {
    const save = vi.fn(async (_d: string, rev: number | null) => view((rev ?? 0) + 1));
    const { saver, saved } = setup(save);
    saver.change('a');
    await vi.advanceTimersByTimeAsync(500);
    saver.change('b');
    await vi.advanceTimersByTimeAsync(500);
    saver.change('c');
    await vi.advanceTimersByTimeAsync(1999);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('c', 3);
    expect(saved[0][0].revision).toBe(4);

    saver.change('d');
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).toHaveBeenLastCalledWith('d', 4);
  });

  it('flush saves at once (leaving the editor) and does nothing without changes', async () => {
    const save = vi.fn(async () => view(4));
    const { saver } = setup(save);
    await saver.flush();
    expect(save).not.toHaveBeenCalled();
    saver.change('x');
    await saver.flush();
    expect(save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('a failed save reports the error and keeps the change for a retry', async () => {
    const save = vi.fn().mockRejectedValueOnce(new CredentialsApiError(0, 'network', 'offline')).mockResolvedValue(view(4));
    const { saver, statuses } = setup(save);
    saver.change('x');
    await vi.advanceTimersByTimeAsync(2000);
    expect(statuses.at(-1)).toBe('error');
    await saver.flush();
    expect(save).toHaveBeenLastCalledWith('x', 3);
    expect(statuses.at(-1)).toBe('saved');
  });

  it('a 409 yields the conflict state holding the server draft; keeping mine saves over its revision', async () => {
    const server = { ...view(7), design: base } as DraftWithDesign;
    const save = vi.fn().mockRejectedValueOnce(new CredentialsApiError(409, 'DRAFT_CONFLICT', 'geändert', server)).mockResolvedValue(view(8));
    const { saver, statuses, conflicts } = setup(save);
    saver.change('mine');
    await vi.advanceTimersByTimeAsync(2000);
    expect(statuses.at(-1)).toBe('conflict');
    expect(conflicts).toEqual([server]);

    // While the dialog is open, further edits wait.
    saver.change('mine2');
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(1);

    await saver.keepMine(server);
    expect(save).toHaveBeenLastCalledWith('mine2', 7);
    expect(statuses.at(-1)).toBe('saved');
  });

  it('loading theirs drops the local change and continues from their revision', async () => {
    const server = { ...view(7), design: base } as DraftWithDesign;
    const save = vi.fn().mockRejectedValueOnce(new CredentialsApiError(409, 'DRAFT_CONFLICT', 'geändert', server)).mockResolvedValue(view(8));
    const { saver } = setup(save);
    saver.change('mine');
    await vi.advanceTimersByTimeAsync(2000);
    saver.loadTheirs(server);
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(1);
    saver.change('next');
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).toHaveBeenLastCalledWith('next', 7);
  });

  it('a new draft is created first (no base revision)', async () => {
    const save = vi.fn(async () => view(1));
    const { saver } = setup(save, null);
    saver.change('new');
    await saver.flush();
    expect(save).toHaveBeenCalledWith('new', null);
    saver.change('more');
    await saver.flush();
    expect(save).toHaveBeenLastCalledWith('more', 1);
  });
});
