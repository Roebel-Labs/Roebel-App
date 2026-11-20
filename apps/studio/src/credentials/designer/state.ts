// Editor state (design + selection + undo history) and the draft autosave. All design changes are
// pure functions of @roebel/card-design/edit applied through `apply`.
import { useEffect, useRef, useState } from 'react';
import type { CardDesign } from '@roebel/card-design';
import { CredentialsApiError } from '../api';
import type { DraftView, DraftWithDesign } from '../types';

export const HISTORY_LIMIT = 100;

export interface EditorState {
  design: CardDesign;
  selected: string | null;
  past: CardDesign[];
  future: CardDesign[];
  dirty: boolean;
  revision: number;
  /** Key of the last apply: applies with the same key (one drag) form one undo step. */
  lastKey: string | null;
}

export type EditorAction =
  | { type: 'select'; id: string | null }
  | { type: 'apply'; fn: (d: CardDesign) => CardDesign; key?: string; select?: string | null | ((next: CardDesign) => string | null) }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'saved'; revision: number; design: CardDesign }
  | { type: 'replace'; design: CardDesign; revision: number };

export function initEditor(design: CardDesign, revision: number): EditorState {
  return { design, selected: null, past: [], future: [], dirty: false, revision, lastKey: null };
}

const keep = (d: CardDesign, id: string | null) => (id && d.layers.some((l) => l.id === id) ? id : null);

export function editorReducer(s: EditorState, a: EditorAction): EditorState {
  switch (a.type) {
    case 'select':
      return s.selected === a.id ? s : { ...s, selected: keep(s.design, a.id), lastKey: null };
    case 'apply': {
      const next = a.fn(s.design);
      const select = typeof a.select === 'function' ? a.select(next) : a.select;
      if (next === s.design) return select !== undefined ? { ...s, selected: keep(s.design, select) } : s;
      const merge = a.key !== undefined && a.key === s.lastKey;
      return {
        ...s,
        design: next,
        past: merge ? s.past : [...s.past, s.design].slice(-HISTORY_LIMIT),
        future: [],
        dirty: true,
        lastKey: a.key ?? null,
        selected: keep(next, select !== undefined ? select : s.selected),
      };
    }
    case 'undo': {
      if (s.past.length === 0) return s;
      const design = s.past[s.past.length - 1];
      return { ...s, design, past: s.past.slice(0, -1), future: [s.design, ...s.future], dirty: true, lastKey: null, selected: keep(design, s.selected) };
    }
    case 'redo': {
      if (s.future.length === 0) return s;
      const [design, ...future] = s.future;
      return { ...s, design, past: [...s.past, s.design].slice(-HISTORY_LIMIT), future, dirty: true, lastKey: null, selected: keep(design, s.selected) };
    }
    case 'saved':
      return { ...s, revision: a.revision, dirty: s.design !== a.design };
    case 'replace':
      return initEditor(a.design, a.revision);
  }
}

// ---- autosave ------------------------------------------------------------------------------

export type SaveStatus = 'saved' | 'saving' | 'error' | 'conflict';

export interface AutosaverOptions<T> {
  /** Saves `doc` on top of `baseRevision` (null = create the draft). */
  save: (doc: T, baseRevision: number | null) => Promise<DraftView>;
  delayMs?: number;
  revision: number | null;
  onStatus: (s: SaveStatus) => void;
  onSaved: (view: DraftView, doc: T) => void;
  onConflict: (server: DraftWithDesign) => void;
}

export interface Autosaver<T> {
  /** A new local version: saved `delayMs` after the last change. */
  change(doc: T): void;
  /** Save now (leaving the editor, "erneut versuchen"). */
  flush(): Promise<void>;
  /** Conflict: save mine over the newer server revision. */
  keepMine(server: DraftWithDesign): Promise<void>;
  /** Conflict: continue from the server's version; the local change is dropped. */
  loadTheirs(server: DraftWithDesign): void;
  cancel(): void;
}

export const isConflict = (e: unknown): e is CredentialsApiError => e instanceof CredentialsApiError && e.status === 409 && e.code === 'DRAFT_CONFLICT';

export function createAutosaver<T>(o: AutosaverOptions<T>): Autosaver<T> {
  const delay = o.delayMs ?? 2000;
  let revision = o.revision;
  let pending: { doc: T } | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> | null = null;
  let blocked = false; // a conflict waits for the person's choice

  const clear = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  const run = async (): Promise<void> => {
    clear();
    if (running) {
      await running;
      return run();
    }
    if (!pending || blocked) return;
    const { doc } = pending;
    pending = null;
    o.onStatus('saving');
    running = (async () => {
      try {
        const view = await o.save(doc, revision);
        revision = view.revision;
        o.onSaved(view, doc);
        o.onStatus(pending ? 'saving' : 'saved');
      } catch (e) {
        pending = pending ?? { doc };
        if (isConflict(e) && e.data) {
          blocked = true;
          o.onConflict(e.data as DraftWithDesign);
          o.onStatus('conflict');
        } else {
          o.onStatus('error');
        }
      }
    })();
    try {
      await running;
    } finally {
      running = null;
    }
  };

  return {
    change(doc) {
      pending = { doc };
      if (blocked) return;
      clear();
      timer = setTimeout(() => void run(), delay);
    },
    flush: run,
    keepMine(server) {
      revision = server.revision;
      blocked = false;
      return run();
    },
    loadTheirs(server) {
      revision = server.revision;
      blocked = false;
      pending = null;
      clear();
      o.onStatus('saved');
    },
    cancel: clear,
  };
}

/**
 * Autosave of the editor's document. Every new `doc` (by identity) after the first render is saved
 * 2 s after the last change; unmounting (tab or org switch, closing the editor) and closing the
 * window save at once. `initialDirty` saves the first version too (a new card from a template).
 */
export function useAutosave<T>(
  doc: T,
  save: (doc: T, baseRevision: number | null) => Promise<DraftView>,
  opts: { revision: number | null; initialDirty?: boolean; delayMs?: number; onSaved: (view: DraftView, doc: T) => void },
) {
  const [status, setStatus] = useState<SaveStatus>('saved');
  const [conflict, setConflict] = useState<DraftWithDesign | null>(null);
  const latest = useRef({ save, onSaved: opts.onSaved });
  latest.current = { save, onSaved: opts.onSaved };
  const saverRef = useRef<Autosaver<T> | null>(null);
  if (!saverRef.current) {
    saverRef.current = createAutosaver<T>({
      save: (d, r) => latest.current.save(d, r),
      onSaved: (v, d) => latest.current.onSaved(v, d),
      delayMs: opts.delayMs,
      revision: opts.revision,
      onStatus: setStatus,
      onConflict: setConflict,
    });
  }
  const saver = saverRef.current;

  const first = useRef(true);
  // Loading the other device's version replaces the document: that is not a local change.
  const skip = useRef(false);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      if (!opts.initialDirty) return;
    }
    if (skip.current) {
      skip.current = false;
      return;
    }
    saver.change(doc);
  }, [doc, saver]);

  useEffect(() => {
    const onUnload = () => void saver.flush();
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      void saver.flush();
    };
  }, [saver]);

  return {
    status,
    conflict,
    flush: () => saver.flush(),
    keepMine: async () => {
      const c = conflict;
      setConflict(null);
      if (c) await saver.keepMine(c);
    },
    loadTheirs: () => {
      const c = conflict;
      setConflict(null);
      if (c) {
        saver.loadTheirs(c);
        skip.current = true;
      }
      return c;
    },
  };
}
