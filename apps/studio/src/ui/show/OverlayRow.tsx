import { useEffect, useRef, useState } from 'react';
import { t } from '../../i18n';
import { defaultRenderContext } from '../../media/program';
import { renderFrame, templateHasContent } from '../../render/draw';
import { useShow } from '../../state/store';
import type { OverlayInstance, RenderContext, ShowState, Template } from '../../state/types';
import { useStudio } from '../studio';
import { useTileDrag } from './tile-drag';
import { useFloating } from '../floating';

const PREVIEW_W = 160;
const PREVIEW_H = 90;
/** Previews only need to follow edits and the clock: 2 fps. */
const PREVIEW_INTERVAL_MS = 500;

/** Which data a template reads ({{row.X}}, {{chat.body}}, …), by namespace. */
function bindingsOf(t: Template): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const m of JSON.stringify(t.nodes ?? []).matchAll(/\{\{\s*(row|next|chat|sponsor)\.([^}\s]+)\s*\}\}/g)) {
    (out[m[1]] ??= []).push(m[2]);
  }
  return out;
}

/** Where an empty graphic gets its data from, as a hint on the tile. */
function emptyHint(tpl: Template): string {
  const b = bindingsOf(tpl);
  if (b.chat) return t('Wartet auf Chat – im Live-Raum „Auf Sendung“');
  if (b.sponsor) return t('Erscheint im Werbeblock');
  return t('Keine Daten – Tabelle füllen');
}

/** Sample data so an empty graphic still shows what it looks like (column names as text). */
function previewContext(t: Template, rc: RenderContext): RenderContext {
  if (templateHasContent(t, rc)) return rc;
  const b = bindingsOf(t);
  const sample = (keys: string[] = []) => Object.fromEntries(keys.map((k) => [k, k]));
  return {
    ...rc,
    row: rc.row ?? sample(b.row),
    next: rc.next ?? sample(b.next),
    chatHighlight: rc.chatHighlight ?? { name: 'Name', body: 'Chat-Nachricht', avatarUrl: '' },
    sponsor: rc.sponsor ?? { name: 'Sponsor', logoUrl: '' },
  };
}

/** One small canvas per overlay tile, drawn with the real renderer (fully faded in, never on air). */
function useOverlayPreviews(state: ShowState) {
  const { engine } = useStudio();
  const canvases = useRef(new Map<string, HTMLCanvasElement>());
  const latest = useRef(state);
  latest.current = state;
  useEffect(() => {
    const draw = () => {
      const s = latest.current;
      const rc = defaultRenderContext(s);
      const now = Date.now();
      for (const o of s.overlays) {
        const ctx = canvases.current.get(o.id)?.getContext('2d');
        const t = s.templates.find((x) => x.id === o.templateId);
        if (!ctx || !t) continue;
        const shown: OverlayInstance = { ...o, visible: true, changedAt: 0, fromProgress: undefined };
        renderFrame(ctx, { ...s, overlays: [shown] }, engine.registry.lookup, previewContext(t, rc), now, {
          scale: PREVIEW_W / 1920,
          overlaysOnly: true,
        });
      }
    };
    draw();
    const t = setInterval(draw, PREVIEW_INTERVAL_MS);
    return () => clearInterval(t);
  }, [engine]);
  return (id: string) => (el: HTMLCanvasElement | null) => {
    if (el) canvases.current.set(id, el);
    else canvases.current.delete(id);
  };
}

/** Hotkey shown on the first overlay of these kinds (see hotkeys.ts). */
const KIND_KEYS: Partial<Record<string, string>> = { lowerThird: 'L', logoBug: 'B' };

function hotkeyFor(state: ShowState, overlayId: string): string | null {
  for (const [kind, key] of Object.entries(KIND_KEYS)) {
    const first = state.overlays.find((o) => state.templates.find((t) => t.id === o.templateId)?.kind === kind);
    if (first?.id === overlayId) return key!;
  }
  return null;
}

function AddOverlayMenu({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useShow();
  const ref = useRef<HTMLDivElement>(null);
  useFloating(ref);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.parentElement?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  return (
    <div className="menu" ref={ref} role="menu" style={{ width: 240 }}>
      <div className="menu-sub hint">{t('Vorlage wählen')}</div>
      {state.templates.map((tpl) => (
        <button
          key={tpl.id}
          className="menu-item"
          onClick={() => {
            dispatch({ type: 'addOverlay', templateId: tpl.id });
            onClose();
          }}
        >
          {tpl.name}
          {tpl.fullScreen && <span className="hint" style={{ marginLeft: 'auto' }}>{t('Vollbild')}</span>}
        </button>
      ))}
    </div>
  );
}

export function OverlayRow() {
  const { state, dispatch } = useShow();
  const [menu, setMenu] = useState(false);
  // Several instances of one template get a running number so the tiles stay distinguishable.
  const seen = new Map<string, number>();
  const rc = defaultRenderContext(state);
  const previewRef = useOverlayPreviews(state);
  const drag = useTileDrag('overlay', (id, to) => dispatch({ type: 'moveOverlay', id, to }));

  return (
    <section>
      <div className="row-head">
        <span className="row-title">{t('Einblendungen')}</span>
        <span className="row-hint">{t('Klick blendet direkt im Live-Bild ein oder aus · Ziehen = umsortieren')}</span>
      </div>
      <div className="strip wrap">
        {state.overlays.map((o, i) => {
          const tpl = state.templates.find((x) => x.id === o.templateId);
          const n = (seen.get(o.templateId) ?? 0) + 1;
          seen.set(o.templateId, n);
          const name = `${tpl?.name ?? t('Unbekannte Vorlage')}${n > 1 ? ` ${n}` : ''}`;
          const key = hotkeyFor(state, o.id);
          const empty = !!tpl && !templateHasContent(tpl, rc);
          return (
            <div key={o.id} className={`ovl-wrap${drag.overIndex === i ? ' drag-target' : ''}`} {...drag.tileProps(o.id, i)}>
              <button
                className={`ovl${o.visible ? ' on' : ''}`}
                title={empty ? t('{hint}. Die Vorschau zeigt Beispieltext.', { hint: emptyHint(tpl!) }) : undefined}
                aria-pressed={o.visible}
                onClick={(e) => {
                  e.currentTarget.blur();
                  dispatch({ type: 'toggleOverlay', id: o.id, now: Date.now() });
                }}
              >
                <canvas className="ovl-preview" ref={previewRef(o.id)} width={PREVIEW_W} height={PREVIEW_H} aria-hidden />
                <span className="ovl-name">{name}</span>
                <span className="ovl-state">
                  {empty ? <span className="ovl-empty">{emptyHint(tpl!)}</span> : o.visible ? t('Eingeblendet') : t('Aus')}
                  {key && (
                    <span className="key" style={{ marginLeft: 'auto' }}>
                      {key}
                    </span>
                  )}
                </span>
              </button>
              {!o.visible && (
                <button
                  className="tile-remove"
                  aria-label={t('{name} entfernen', { name })}
                  onClick={() => dispatch({ type: 'removeOverlay', id: o.id })}
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
        <div className="add-wrap">
          <button className="add-tile small" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
            + Overlay
          </button>
          {menu && <AddOverlayMenu onClose={() => setMenu(false)} />}
        </div>
      </div>
    </section>
  );
}
