// The card designer: add panel | card with selection handles | settings of the selected element.
// Every change autosaves to the draft (2 s after the last change, and when leaving). "Auf mein Handy
// senden" shows the draft privately in the Röbel App; "Veröffentlichen" prepares a register change
// that the phone confirms (PendingCard) — nothing here claims it is live before that.
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { designSize, removeLayer, updateLayer, type CardDesign, type CardTemplate, type SkImageLike } from '@roebel/card-design';
import { t } from '../../i18n';
import { SkCards } from '../../ui/Skeleton';
import { fetchDesignAssets, fetchDraft, publishDraft, saveDraft, sendDraftTest, uploadDesignAsset, CredentialsApiError, isSessionError } from '../api';
import { PendingCard } from '../PendingCard';
import { KIND_LABELS } from '../templates';
import type { TabContext } from '../tabs';
import type { AssetKind, AssetView, DraftView, Kind, OrgListItem } from '../types';
import { AddPanel, type Apply } from './AddPanel';
import { CardCanvas } from './CardCanvas';
import { ConflictDialog } from './ConflictDialog';
import { designHints, type HintKind } from './hints';
import { Overlay } from './Overlay';
import { PreviewModes } from './PreviewModes';
import { PropsPanel, hintText, layerLabel } from './PropsPanel';
import { editorReducer, initEditor, useAutosave, type SaveStatus } from './state';
import { TemplatePicker, templateLabel } from './TemplatePicker';
import { assetKindFor, logoTarget, uploadForDesign, type UploadTarget } from './upload';
import './designer.css';

const KINDS: Kind[] = ['membership', 'role', 'badge'];

/** Whether "Veröffentlichen" can be pressed, and why not. */
export function publishGate(p: { register: boolean; org: Pick<OrgListItem, 'onChain'>; draft: DraftView | null; status: SaveStatus }): { enabled: boolean; reason: string | null } {
  if (!p.register || p.org.onChain !== 'ready') return { enabled: false, reason: t('Veröffentlichen geht, sobald eure Organisation im Register eingetragen ist.') };
  if (p.draft?.pendingVersion != null) return { enabled: false, reason: t('Eine Veröffentlichung wartet schon auf Bestätigung.') };
  if (!p.draft || p.status === 'conflict') return { enabled: false, reason: null };
  return { enabled: true, reason: null };
}

export function saveStatusText(s: SaveStatus): string {
  return s === 'saving' ? t('Speichert …') : s === 'error' ? t('Nicht gespeichert – erneut versuchen') : s === 'conflict' ? t('Auf einem anderen Gerät geändert') : t('Gespeichert');
}

/** Header of the designer (static parts tested without a DOM). */
export function DesignerHeader({
  name, kind, kindLocked, status, gate, live, busy, onName, onKind, onBack, onRetry, onTest, onPublish,
}: {
  name: string;
  kind: Kind;
  kindLocked: boolean;
  status: SaveStatus;
  gate: { enabled: boolean; reason: string | null };
  live: boolean;
  busy: boolean;
  onName: (v: string) => void;
  onKind: (k: Kind) => void;
  onBack: () => void;
  onRetry: () => void;
  onTest: () => void;
  onPublish: () => void;
}) {
  return (
    <header className="dz-head">
      <button className="w-btn ghost" onClick={onBack}>
        {t('Zurück')}
      </button>
      <input className="dz-name" value={name} maxLength={80} placeholder={t('Name des Ausweises')} aria-label={t('Name des Ausweises')} onChange={(e) => onName(e.target.value)} />
      <select className="pz-select" value={kind} disabled={kindLocked} aria-label={t('Art')} title={kindLocked ? t('Die Art bleibt nach der ersten Veröffentlichung fest.') : undefined} onChange={(e) => onKind(e.target.value as Kind)}>
        {KINDS.map((k) => (
          <option key={k} value={k}>
            {t(KIND_LABELS[k])}
          </option>
        ))}
      </select>
      {status === 'error' ? (
        <button className="dz-save error" onClick={onRetry}>
          {saveStatusText(status)}
        </button>
      ) : (
        <span className={`dz-save ${status}`} role="status">
          {saveStatusText(status)}
        </span>
      )}
      <span className="ws-tools-spacer" />
      <button className="w-btn" disabled={busy || status === 'conflict'} onClick={onTest}>
        {t('Auf mein Handy senden')}
      </button>
      <button className="w-btn green" disabled={busy || !gate.enabled} title={gate.reason ?? undefined} onClick={onPublish}>
        {live ? t('Update veröffentlichen') : t('Veröffentlichen')}
      </button>
      {gate.reason && <p className="dz-gate">{gate.reason}</p>}
    </header>
  );
}

type Loaded = { draft: DraftView | null; design: CardDesign; name: string; kind: Kind; template: string | null };

export function Designer({ ctx, draftId, onClose }: { ctx: TabContext; draftId?: string; onClose: () => void }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const { token, onError } = ctx;

  useEffect(() => {
    if (!draftId) return;
    let alive = true;
    fetchDraft(token, draftId).then(
      (d) => alive && setLoaded({ draft: d, design: d.design, name: d.name, kind: d.kind, template: d.template }),
      (e) => {
        onError(e);
        onClose();
      },
    );
    return () => {
      alive = false;
    };
  }, [token, draftId]);

  const start = (tpl: CardTemplate) =>
    setLoaded({ draft: null, design: tpl.design, name: tpl.id === 'leer' ? '' : templateLabel(tpl.id, tpl.label), kind: tpl.format === 'stamp' ? 'badge' : 'membership', template: tpl.id === 'leer' ? null : tpl.id });

  if (!loaded) return draftId ? <SkCards cards={2} height={180} /> : <TemplatePicker onPick={start} onCancel={onClose} />;
  return <Editor ctx={ctx} initial={loaded} onClose={onClose} />;
}

function Editor({ ctx, initial, onClose }: { ctx: TabContext; initial: Loaded; onClose: () => void }) {
  const { token, org, onError, register } = ctx;
  const [s, dispatch] = useReducer(editorReducer, initial, (i) => initEditor(i.design, i.draft?.revision ?? 0));
  const [name, setName] = useState(initial.name);
  const [kind, setKind] = useState<Kind>(initial.kind);
  const [draft, setDraft] = useState<DraftView | null>(initial.draft);
  const [view, setView] = useState<'edit' | 'preview'>('edit');
  const [picking, setPicking] = useState(false);
  const [assets, setAssets] = useState<AssetView[]>([]);
  const [uploading, setUploading] = useState<AssetKind | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ id: string; title: string } | null>(null);
  const [sizes, setSizes] = useState<Map<string, { w: number; h: number }>>(() => new Map());
  const [boardWidth, setBoardWidth] = useState(560);
  const draftIdRef = useRef<string | null>(initial.draft?.id ?? null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<string | null>(null);
  const designRef = useRef(s.design);
  designRef.current = s.design;

  const doc = useMemo(() => ({ design: s.design, name, kind }), [s.design, name, kind]);
  const save = useCallback(
    (d: typeof doc, rev: number | null) =>
      saveDraft(token, {
        accountId: org.accountId,
        ...(draftIdRef.current ? { draftId: draftIdRef.current, baseRevision: rev ?? 0 } : {}),
        name: d.name.trim() || 'Ausweis',
        kind: d.kind,
        template: initial.template,
        design: d.design,
      }).catch((e: unknown) => {
        if (isSessionError(e)) onError(e);
        throw e;
      }),
    [token, org.accountId, initial.template, onError],
  );
  const autosave = useAutosave(doc, save, {
    revision: initial.draft?.revision ?? null,
    initialDirty: !initial.draft,
    onSaved: (v, d) => {
      draftIdRef.current = v.id;
      setDraft(v);
      dispatch({ type: 'saved', revision: v.revision, design: d.design });
    },
  });

  useEffect(() => {
    fetchDesignAssets(token, org.accountId).then(setAssets, () => undefined);
  }, [token, org.accountId]);

  // Card width follows the centre column.
  useEffect(() => {
    const el = boardRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setBoardWidth(Math.max(240, Math.min(680, Math.floor(e.contentRect.width) - 48))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const apply: Apply = useCallback((fn, o) => dispatch({ type: 'apply', fn, key: o?.key, select: o?.select }), []);
  const select = useCallback((id: string | null) => dispatch({ type: 'select', id }), []);

  // Keyboard: arrows move (Shift 10), Delete removes, ⌘Z / ⇧⌘Z, Escape deselects.
  const sel = s.selected;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        dispatch({ type: 'redo' });
        return;
      }
      if (view !== 'edit' || !sel) return;
      if (e.key === 'Escape') return dispatch({ type: 'select', id: null });
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        return apply((d) => removeLayer(d, sel));
      }
      const step = e.shiftKey ? 10 : 1;
      const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (!delta) return;
      e.preventDefault();
      apply(
        (d) => {
          const l = d.layers.find((x) => x.id === sel);
          return l ? updateLayer(d, sel, { x: l.x + delta[0], y: l.y + delta[1] }) : d;
        },
        { key: `nudge-${sel}` },
      );
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sel, view, apply]);

  const hints = useMemo(() => {
    const m = new Map<string, HintKind[]>();
    for (const h of designHints(s.design, sizes)) m.set(h.layerId, [...(m.get(h.layerId) ?? []), h.kind]);
    return m;
  }, [s.design, sizes]);

  const onImages = useCallback((imgs: Map<string, SkImageLike>) => {
    const m = new Map<string, { w: number; h: number }>();
    for (const [id, img] of imgs) m.set(id, { w: img.width(), h: img.height() });
    setSizes(m);
  }, []);

  const urls = useMemo(() => Object.fromEntries(assets.map((a) => [a.sha, a.url])), [assets]);

  const leave = async () => {
    await autosave.flush();
    onClose();
  };

  const test = async () => {
    setBusy(true);
    setNotice(null);
    try {
      await autosave.flush();
      if (!draftIdRef.current) return;
      await sendDraftTest(token, draftIdRef.current);
      setNotice(t('Gesendet. Der Entwurf erscheint in der Röbel App auf deinem Handy, nur für dich.'));
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    setBusy(true);
    setNotice(null);
    try {
      await autosave.flush();
      if (!draftIdRef.current) return;
      const r = await publishDraft(token, draftIdRef.current);
      setPending({ id: r.actionId, title: name.trim() || t('Ohne Namen') });
      setDraft((d) => (d ? { ...d, pendingVersion: r.version } : d));
    } catch (e) {
      if (e instanceof CredentialsApiError && e.code === 'NO_CHANGES') setNotice(e.message);
      else onError(e);
    } finally {
      setBusy(false);
    }
  };

  // Uploads: the server checks size and format; its message is shown and the design stays as it was.
  const upload = async (file: File, target: UploadTarget) => {
    const kind = assetKindFor(target, designRef.current);
    setUploading(kind);
    try {
      const r = await uploadForDesign(file, target, designRef.current, (k, f) => uploadDesignAsset(token, org.accountId, k, f), onError);
      if (!r) return;
      setAssets((list) => [r.asset, ...list.filter((a) => a.sha !== r.asset.sha)]);
      apply(r.change, { select: 'replace' in target ? target.replace : target.role === 'background' ? null : (d) => d.layers[d.layers.length - 1]?.id ?? null });
    } finally {
      setUploading(null);
    }
  };
  const onUpload = (k: AssetKind, file: File) =>
    void upload(file, k === 'logo' ? logoTarget(designRef.current) : k === 'background' ? { role: 'background' } : k === 'sticker' ? { role: 'sticker' } : { role: 'image' });
  const onDropFile = (file: File, target: string | null) => {
    const l = s.design.layers.find((x) => x.id === target);
    void upload(file, l?.type === 'image' ? { replace: l.id } : { role: 'image' });
  };
  const onReplaceImage = (layerId: string) => {
    replaceTarget.current = layerId;
    fileRef.current?.click();
  };

  const keepMine = async () => {
    setBusy(true);
    try {
      await autosave.keepMine();
    } finally {
      setBusy(false);
    }
  };
  const loadTheirs = () => {
    const c = autosave.loadTheirs();
    if (!c) return;
    dispatch({ type: 'replace', design: c.design, revision: c.revision });
    setName(c.name);
    setKind(c.kind);
    const { design: _design, ...view } = c;
    setDraft(view);
  };

  const refreshDraft = () => {
    if (draftIdRef.current) fetchDraft(token, draftIdRef.current).then((d) => setDraft(d), () => undefined);
  };

  const gate = publishGate({ register, org, draft, status: autosave.status });
  const { w: DW } = designSize(s.design.format);
  const cardWidth = s.design.format === 'stamp' ? Math.min(boardWidth, 420) : boardWidth;
  const scale = cardWidth / DW;
  const selHints = sel ? (hints.get(sel) ?? []) : [];
  const allHints = [...hints].flatMap(([id, ks]) => ks.map((k) => ({ id, k })));

  if (picking)
    return (
      <div className="dz-designer">
        <TemplatePicker
          onCancel={() => setPicking(false)}
          onPick={(tpl) => {
            setPicking(false);
            apply(() => tpl.design, { select: null });
          }}
        />
      </div>
    );

  return (
    <div className="dz-designer">
      <DesignerHeader
        name={name}
        kind={kind}
        kindLocked={draft?.liveVersion != null}
        status={autosave.status}
        gate={gate}
        live={draft?.liveVersion != null}
        busy={busy}
        onName={setName}
        onKind={setKind}
        onBack={() => void leave()}
        onRetry={() => void autosave.flush()}
        onTest={() => void test()}
        onPublish={() => void publish()}
      />
      {notice && (
        <div className="dz-notice" role="status">
          <span>{notice}</span>
          <button className="w-btn ghost" onClick={() => setNotice(null)}>
            {t('Schließen')}
          </button>
        </div>
      )}
      {pending && <PendingCard ctx={ctx} actionId={pending.id} title={pending.title} onFinal={refreshDraft} onClose={() => (setPending(null), refreshDraft())} />}
      {autosave.conflict && <ConflictDialog busy={busy} onKeepMine={() => void keepMine()} onLoadTheirs={loadTheirs} />}
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          const id = replaceTarget.current;
          e.target.value = '';
          replaceTarget.current = null;
          if (f && id) void upload(f, { replace: id });
        }}
      />
      <div className="dz-cols">
        <aside className="dz-left">
          <AddPanel design={s.design} apply={apply} assets={assets} uploading={uploading} onUpload={onUpload} onTemplates={() => setPicking(true)} />
        </aside>
        <main className="dz-centre" ref={boardRef}>
          <div className="dz-bar">
            <div className="dz-seg">
              <button aria-pressed={view === 'edit'} onClick={() => setView('edit')}>
                {t('Bearbeiten')}
              </button>
              <button aria-pressed={view === 'preview'} onClick={() => setView('preview')}>
                {t('Vorschau')}
              </button>
            </div>
            <span className="ws-tools-spacer" />
            <button className="w-btn" disabled={s.past.length === 0} title="⌘Z" onClick={() => dispatch({ type: 'undo' })}>
              {t('Rückgängig')}
            </button>
            <button className="w-btn" disabled={s.future.length === 0} title="⇧⌘Z" onClick={() => dispatch({ type: 'redo' })}>
              {t('Wiederholen')}
            </button>
          </div>
          {view === 'edit' ? (
            <>
              <div className="dz-board">
                <div className="dz-cardwrap" style={{ width: cardWidth }}>
                  <CardCanvas design={s.design} width={cardWidth} shine="loop" urls={urls} onImages={onImages} />
                  <Overlay
                    design={s.design}
                    selected={s.selected}
                    scale={scale}
                    onSelect={select}
                    apply={(fn, key) => apply(fn, { key })}
                    onDropFile={onDropFile}
                    onEditText={(id) => {
                      select(id);
                      setTimeout(() => textRef.current?.focus(), 0);
                    }}
                  />
                </div>
              </div>
              {allHints.length > 0 && (
                <ul className="dz-hints" aria-label={t('Hinweise')}>
                  {allHints.map(({ id, k }) => {
                    const l = s.design.layers.find((x) => x.id === id);
                    return (
                      <li key={`${id}-${k}`}>
                        <button className={selHints.includes(k) && sel === id ? 'on' : ''} onClick={() => select(id)}>
                          {hintText(k)}
                          {l ? ` · ${layerLabel(l)}` : ''}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          ) : (
            <PreviewModes design={s.design} urls={urls} width={boardWidth} />
          )}
        </main>
        <aside className="dz-right">
          <PropsPanel ref={textRef} design={s.design} selected={s.selected} hints={hints} apply={apply} onSelect={select} onReplaceImage={onReplaceImage} />
        </aside>
      </div>
    </div>
  );
}
