import { useEffect, useMemo, useRef, useState } from 'react';
import { loadFonts } from '../../render/fonts';
import { renderFrame } from '../../render/draw';
import { isStarterTemplate } from '../../render/templates';
import { commitValue } from '../table/edit';
import { useShow } from '../../state/store';
import type { OverlayAnim, RenderContext, ShowState, Template, TemplateNode } from '../../state/types';
import { applyNodeEdit, duplicateTemplate, insertAtCursor, isProtectedNode, removeNode } from './edit';
import './design.css';

const SAMPLE_ROW = { Gruppe: 'Sunshine Kids', Verein: 'TSV Röbel', Kategorie: 'Kinder Showdance' };
const NO_MEDIA = () => ({ el: null, status: 'lost' as const });
const HOLD_MS = 700;

type Field = HTMLInputElement | HTMLTextAreaElement;

/** State with only this template's overlay on screen and no program picture. */
function previewState(s: ShowState, templateId: string, visible: boolean, changedAt: number, fromProgress: number): ShowState {
  return {
    ...s,
    programSceneId: null,
    previewSceneId: null,
    transition: { ...s.transition, startedAt: null, fromSceneId: null },
    overlays: [{ id: 'design-preview', templateId, visible, changedAt, fromProgress }],
  };
}

function useContextFor(s: ShowState): RenderContext {
  return useMemo(() => {
    const rows = s.table.rows;
    const i = rows.findIndex((r) => r.id === s.table.currentRowId);
    const cur = i >= 0 ? rows[i] : rows[0];
    const next = i >= 0 ? rows[i + 1] : rows[1];
    const sp = s.sponsors.items[0];
    return {
      row: cur ? cur.values : SAMPLE_ROW,
      next: next ? next.values : { ...SAMPLE_ROW, Gruppe: 'Sternchen' },
      now: new Date(),
      sponsor: { name: sp?.name ?? 'Bäckerei Schulz', logoUrl: sp?.logoUrl ?? '' },
      donation: { name: 'Familie Krüger', amount: '20 €', message: 'Viel Erfolg!' },
    };
  }, [s.table, s.sponsors]);
}

function Thumb({ state, template, rc }: { state: ShowState; template: Template; rc: RenderContext }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let dead = false;
    void loadFonts().then(() => {
      const c = ref.current?.getContext('2d');
      if (dead || !c) return;
      const st = previewState({ ...state, templates: state.templates.map((t) => (t.id === template.id ? template : t)) }, template.id, true, 0, 1);
      renderFrame(c, st, NO_MEDIA, rc, 1e9, { overlaysOnly: true, scale: 0.15 });
    });
    return () => {
      dead = true;
    };
    // Rendered once per template change, not per frame.
  }, [template, rc]); // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={ref} width={288} height={162} className="ds-thumb" />;
}

function Num({ label, value, onChange, step = 1 }: { label: string; value: number | undefined; onChange: (v: number) => void; step?: number }) {
  // Draft while typing; commit (and clamp) on blur/Enter so "24" never passes through "2".
  const [draft, setDraft] = useState(String(value ?? ''));
  const [resync, setResync] = useState(0);
  useEffect(() => setDraft(String(value ?? '')), [value, resync]);
  const cancelled = useRef(false);
  const commit = () => {
    const c = cancelled.current;
    cancelled.current = false;
    const v = Number(draft);
    const out = commitValue(draft, String(value ?? ''), c);
    if (out !== null && draft.trim() !== '' && Number.isFinite(v) && v !== value) onChange(v);
    setResync((n) => n + 1);
  };
  return (
    <label className="ds-f ds-num">
      <span>{label}</span>
      <input
        type="number"
        step={step}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          else if (e.key === 'Escape') {
            cancelled.current = true;
            setDraft(String(value ?? ''));
            e.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

/** Single-line text input with a local draft; the on-air graphic only changes on blur/Enter (the renderer has no newlines). */
function DraftText({
  value,
  onCommit,
  ...rest
}: {
  value: string;
  onCommit: (v: string) => void;
  'data-field': string;
  onFocus: (e: React.FocusEvent<Field>) => void;
  spellCheck?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const cancelled = useRef(false);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      type="text"
      value={draft}
      {...rest}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const out = commitValue(draft, value, cancelled.current);
        cancelled.current = false;
        if (out !== null) onCommit(out);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        else if (e.key === 'Escape') {
          cancelled.current = true;
          setDraft(value);
          e.currentTarget.blur();
        }
      }}
    />
  );
}

function Colour({ label, value, onChange }: { label: string; value: string | undefined; onChange: (v: string) => void }) {
  const v = value ?? '#000000';
  const [draft, setDraft] = useState(v);
  useEffect(() => setDraft(v), [v]);
  const valid = (x: string) => /^#[0-9a-fA-F]{6}$/.test(x);
  return (
    <label className="ds-f ds-colour">
      <span>{label}</span>
      <div>
        <input type="color" value={valid(v) ? v : '#000000'} onChange={(e) => onChange(e.target.value.toUpperCase())} />
        <input
          type="text"
          value={draft}
          spellCheck={false}
          onBlur={() => setDraft(v)}
          onChange={(e) => {
            setDraft(e.target.value);
            if (valid(e.target.value)) onChange(e.target.value.toUpperCase());
          }}
        />
      </div>
    </label>
  );
}

function AnimFields({ title, anim, onChange }: { title: string; anim: OverlayAnim; onChange: (a: OverlayAnim) => void }) {
  const set = (p: Partial<OverlayAnim>) => onChange({ ...anim, ...p });
  return (
    <fieldset className="ds-group">
      <legend>{title}</legend>
      <label className="ds-f">
        <span>Art</span>
        <select value={anim.kind} onChange={(e) => set({ kind: e.target.value as OverlayAnim['kind'] })}>
          <option value="none">Keine</option>
          <option value="fade">Blende</option>
          <option value="slide">Schieben</option>
          <option value="scale">Skalieren</option>
          <option value="wipe">Wischen</option>
        </select>
      </label>
      <Num label="Dauer (ms)" value={anim.durationMs} step={50} onChange={(v) => set({ durationMs: Math.max(0, v) })} />
      <label className="ds-f">
        <span>Verlauf</span>
        <select value={anim.easing} onChange={(e) => set({ easing: e.target.value as OverlayAnim['easing'] })}>
          <option value="linear">Linear</option>
          <option value="easeInOut">Sanft</option>
          <option value="easeOut">Abbremsen</option>
          <option value="backOut">Überschwingen</option>
        </select>
      </label>
      {(anim.kind === 'slide' || anim.kind === 'wipe') && (
        <label className="ds-f">
          <span>Richtung</span>
          <select value={anim.from ?? 'bottom'} onChange={(e) => set({ from: e.target.value as OverlayAnim['from'] })}>
            <option value="left">Von links</option>
            <option value="right">Von rechts</option>
            <option value="top">Von oben</option>
            <option value="bottom">Von unten</option>
          </select>
        </label>
      )}
      <Num label="Versatz (ms)" value={anim.staggerMs ?? 0} step={10} onChange={(v) => set({ staggerMs: Math.max(0, v) })} />
    </fieldset>
  );
}

export function DesignTab() {
  const { state, dispatch } = useShow();
  const [selId, setSelId] = useState<string>(state.templates[0]?.id ?? '');
  const [nodeId, setNodeId] = useState<string | null>(null);
  const template = state.templates.find((t) => t.id === selId) ?? state.templates[0];
  const rc = useContextFor(state);
  const rcRef = useRef(rc);
  rcRef.current = rc;
  const stateRef = useRef(state);
  stateRef.current = state;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const play = useRef<{ t0: number } | null>(null);
  const focused = useRef<{ el: Field; nodeId: string } | null>(null);

  const node = template?.nodes.find((n) => n.id === nodeId) ?? null;
  const isStarter = template ? isStarterTemplate(template.id) : false;

  // Big preview: rAF only while mounted.
  useEffect(() => {
    let raf = 0;
    let alive = true;
    let last = 0;
    const tick = () => {
      if (!alive) return;
      if (performance.now() - last < 33) {
        raf = requestAnimationFrame(tick);
        return;
      }
      last = performance.now();
      const c = canvasRef.current?.getContext('2d');
      const tid = template?.id;
      if (c && tid) {
        const now = performance.now();
        let visible = true;
        let changedAt = 0;
        let from = 1;
        const p = play.current;
        if (p) {
          const t = stateRef.current.templates.find((x) => x.id === tid);
          const inMs = (t?.animIn.durationMs ?? 0) + 600;
          const el = now - p.t0;
          if (el < inMs + HOLD_MS) {
            visible = true;
            changedAt = p.t0;
            from = 0;
          } else if (el < inMs + HOLD_MS + (t?.animOut.durationMs ?? 0) + 600) {
            visible = false;
            changedAt = p.t0 + inMs + HOLD_MS;
            from = 1;
          } else {
            play.current = null;
          }
        }
        const st = previewState(stateRef.current, tid, visible, changedAt, from);
        renderFrame(c, st, NO_MEDIA, { ...rcRef.current, now: new Date() }, now, { overlaysOnly: true, scale: 0.5 });
      }
      raf = requestAnimationFrame(tick);
    };
    void loadFonts().then(() => {
      if (alive) raf = requestAnimationFrame(tick);
    });
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [template?.id]);

  if (!template) return <div className="ds-empty">Keine Vorlagen vorhanden.</div>;

  const edit = (id: string, patch: Partial<TemplateNode>) => dispatch({ type: 'updateTemplate', template: applyNodeEdit(template, id, patch) });
  const setAnim = (k: 'animIn' | 'animOut', a: OverlayAnim) => dispatch({ type: 'updateTemplate', template: { ...template, [k]: a } });

  const columns = state.table.columns;
  const bindings = [
    ...columns.map((c) => `{{row.${c}}}`),
    ...columns.map((c) => `{{next.${c}}}`),
    '{{time}}',
    '{{date}}',
    '{{sponsor.name}}',
    '{{sponsor.logo}}',
    '{{donation.name}}',
    '{{donation.amount}}',
    '{{donation.message}}',
  ];

  const insertBinding = (b: string) => {
    const f = focused.current;
    if (!f || !template.nodes.some((n) => n.id === f.nodeId)) return;
    const cur = template.nodes.find((n) => n.id === f.nodeId);
    const field = f.el.dataset.field === 'src' ? 'src' : 'text';
    const base = f.el.value ?? (field === 'src' ? cur?.src : cur?.text) ?? '';
    const r = insertAtCursor(base, f.el.selectionStart ?? base.length, f.el.selectionEnd ?? base.length, b);
    edit(f.nodeId, field === 'src' ? { src: r.value } : { text: r.value });
    f.el.value = r.value;
    requestAnimationFrame(() => {
      f.el.focus();
      f.el.setSelectionRange(r.caret, r.caret);
    });
  };

  const pickImage = async (n: TemplateNode) => {
    const path = await window.studio.dialog.pickFile('image');
    if (!path) return;
    const url = await window.studio.media.allow(path);
    edit(n.id, { src: url });
  };

  const duplicate = () => {
    const id = `custom-${crypto.randomUUID().slice(0, 8)}`;
    dispatch({ type: 'addTemplate', template: duplicateTemplate(template, id) });
    setSelId(id);
    setNodeId(null);
  };

  const removeCustom = () => {
    const live = state.overlays.some((o) => o.templateId === template.id && o.visible);
    const msg = `„${template.name}“ wirklich löschen?${live ? '\n\nDiese Grafik ist gerade eingeblendet.' : ''}`;
    if (!window.confirm(msg)) return;
    dispatch({ type: 'removeTemplate', id: template.id });
    setSelId(state.templates[0]?.id ?? '');
    setNodeId(null);
  };

  const trackFocus = (n: TemplateNode) => ({
    onFocus: (e: React.FocusEvent<Field>) => {
      focused.current = { el: e.currentTarget, nodeId: n.id };
    },
  });

  return (
    <div className="ds">
      <aside className="ds-list">
        <h3>Vorlagen</h3>
        <div className="ds-items">
          {state.templates.map((t) => (
            <button
              key={t.id}
              className={`ds-item${t.id === template.id ? ' sel' : ''}`}
              onClick={() => {
                setSelId(t.id);
                setNodeId(null);
              }}
            >
              <Thumb state={state} template={t} rc={rc} />
              <span>{t.name}</span>
            </button>
          ))}
        </div>
        <div className="ds-actions">
          <button className="btn" onClick={duplicate}>
            Duplizieren
          </button>
          {isStarter ? (
            <button className="btn" onClick={() => dispatch({ type: 'resetTemplate', id: template.id })}>
              Zurücksetzen
            </button>
          ) : (
            <button className="btn danger" onClick={removeCustom}>
              Löschen
            </button>
          )}
        </div>
      </aside>

      <section className="ds-stage">
        <div className="ds-stage-head">
          <h3>{template.name}</h3>
          <button className="btn" onClick={() => (play.current = { t0: performance.now() })}>
            Animation abspielen
          </button>
        </div>
        <div className="ds-checker">
          <canvas ref={canvasRef} width={960} height={540} />
        </div>
        <p className="ds-hint">Vorschau mit {state.table.rows.length > 0 ? 'der aktuellen Tabellenzeile' : 'Beispieldaten'}. Genau so geht die Grafik auf Sendung.</p>
      </section>

      <aside className="ds-inspector">
        <h3>Elemente</h3>
        <div className="ds-nodes">
          {template.nodes.map((n) => (
            <button key={n.id} className={`ds-node${n.id === nodeId ? ' sel' : ''}`} onClick={() => setNodeId(n.id)}>
              <span className="ds-node-type">{n.type === 'text' ? 'Text' : n.type === 'image' ? 'Bild' : 'Fläche'}</span>
              <span className="ds-node-name">{n.type === 'text' ? n.text || n.id : n.id}</span>
            </button>
          ))}
        </div>

        {node && (
          <div className="ds-form">
            {node.type === 'text' && (
              <>
                <label className="ds-f">
                  <span>Text</span>
                  <DraftText key={node.id} value={node.text ?? ''} data-field="text" {...trackFocus(node)} onCommit={(v) => edit(node.id, { text: v })} />
                </label>
                <div className="ds-bindings">
                  <span className="ds-label">Platzhalter einfügen</span>
                  <div>
                    {bindings.map((b) => (
                      <button key={b} className="ds-chip" onMouseDown={(e) => e.preventDefault()} onClick={() => insertBinding(b)}>
                        {b}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="ds-f">
                  <span>Schrift</span>
                  <select value={node.font ?? 'Inter'} onChange={(e) => edit(node.id, { font: e.target.value as TemplateNode['font'] })}>
                    <option value="Inter">Inter</option>
                    <option value="Plus Jakarta Sans">Plus Jakarta Sans</option>
                  </select>
                </label>
                <label className="ds-f">
                  <span>Stärke</span>
                  <select value={node.weight ?? 600} onChange={(e) => edit(node.id, { weight: Number(e.target.value) as TemplateNode['weight'] })}>
                    <option value={400}>400 Normal</option>
                    <option value={600}>600 Halbfett</option>
                    <option value={700}>700 Fett</option>
                    <option value={800}>800 Extrafett</option>
                  </select>
                </label>
                <Num label="Größe" value={node.size} onChange={(v) => edit(node.id, { size: v })} />
                <Colour label="Textfarbe" value={node.color} onChange={(v) => edit(node.id, { color: v })} />
                <label className="ds-f">
                  <span>Ausrichtung</span>
                  <select value={node.align ?? 'left'} onChange={(e) => edit(node.id, { align: e.target.value as TemplateNode['align'] })}>
                    <option value="left">Links</option>
                    <option value="center">Mitte</option>
                    <option value="right">Rechts</option>
                  </select>
                </label>
              </>
            )}
            {node.type === 'rect' && (
              <>
                <Colour label="Füllfarbe" value={node.fill} onChange={(v) => edit(node.id, { fill: v })} />
                <Num label="Eckenradius" value={node.radius ?? 0} onChange={(v) => edit(node.id, { radius: v })} />
              </>
            )}
            {node.type === 'image' && (
              <>
                <label className="ds-f">
                  <span>Bild (Datei-URL oder Platzhalter)</span>
                  <DraftText key={node.id} value={node.src ?? ''} data-field="src" spellCheck={false} {...trackFocus(node)} onCommit={(v) => edit(node.id, { src: v })} />
                </label>
                <div className="ds-bindings">
                  <button className="btn" onClick={() => void pickImage(node)}>
                    Bild wählen …
                  </button>
                  <button className="ds-chip" onMouseDown={(e) => e.preventDefault()} onClick={() => edit(node.id, { src: '{{sponsor.logo}}' })}>
                    {'{{sponsor.logo}}'}
                  </button>
                </div>
                <label className="ds-f">
                  <span>Anpassung</span>
                  <select value={node.fit ?? 'contain'} onChange={(e) => edit(node.id, { fit: e.target.value as TemplateNode['fit'] })}>
                    <option value="contain">Einpassen</option>
                    <option value="cover">Füllen</option>
                  </select>
                </label>
              </>
            )}
            <div className="ds-grid">
              <Num label="X" value={node.x} onChange={(v) => edit(node.id, { x: v })} />
              <Num label="Y" value={node.y} onChange={(v) => edit(node.id, { y: v })} />
              <Num label="Breite" value={node.w} onChange={(v) => edit(node.id, { w: v })} />
              <Num label="Höhe" value={node.h} onChange={(v) => edit(node.id, { h: v })} />
              <Num label="Deckkraft" value={node.opacity ?? 1} step={0.05} onChange={(v) => edit(node.id, { opacity: v })} />
              <Num label="Verzögerung (ms)" value={node.delayMs ?? 0} step={10} onChange={(v) => edit(node.id, { delayMs: v })} />
            </div>
            {!isProtectedNode(template, node.id) && !isStarter && (
              <button
                className="btn danger"
                onClick={() => {
                  dispatch({ type: 'updateTemplate', template: removeNode(template, node.id) });
                  setNodeId(null);
                }}
              >
                Element löschen
              </button>
            )}
          </div>
        )}

        <AnimFields title="Einblenden" anim={template.animIn} onChange={(a) => setAnim('animIn', a)} />
        <AnimFields title="Ausblenden" anim={template.animOut} onChange={(a) => setAnim('animOut', a)} />
      </aside>
    </div>
  );
}
