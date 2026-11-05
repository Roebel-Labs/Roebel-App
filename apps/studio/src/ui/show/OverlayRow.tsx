import { useEffect, useRef, useState } from 'react';
import { defaultRenderContext } from '../../media/program';
import { templateHasContent } from '../../render/draw';
import { useShow } from '../../state/store';
import type { ShowState } from '../../state/types';

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
      <div className="menu-sub hint">Vorlage wählen</div>
      {state.templates.map((t) => (
        <button
          key={t.id}
          className="menu-item"
          onClick={() => {
            dispatch({ type: 'addOverlay', templateId: t.id });
            onClose();
          }}
        >
          {t.name}
          {t.fullScreen && <span className="hint" style={{ marginLeft: 'auto' }}>Vollbild</span>}
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

  return (
    <section>
      <div className="row-head">
        <span className="row-title">Einblendungen</span>
        <span className="row-hint">Klick blendet direkt im Live-Bild ein oder aus</span>
      </div>
      <div className="strip wrap">
        {state.overlays.map((o) => {
          const t = state.templates.find((x) => x.id === o.templateId);
          const n = (seen.get(o.templateId) ?? 0) + 1;
          seen.set(o.templateId, n);
          const name = `${t?.name ?? 'Unbekannte Vorlage'}${n > 1 ? ` ${n}` : ''}`;
          const key = hotkeyFor(state, o.id);
          const empty = !!t && !templateHasContent(t, rc);
          return (
            <div key={o.id} className="ovl-wrap">
              <button
                className={`ovl${o.visible ? ' on' : ''}`}
                title={empty ? 'Wird erst gezeigt, wenn die Tabelle Daten für diese Einblendung hat.' : undefined}
                aria-pressed={o.visible}
                onClick={(e) => {
                  e.currentTarget.blur();
                  dispatch({ type: 'toggleOverlay', id: o.id, now: Date.now() });
                }}
              >
                <span className="ovl-name">{name}</span>
                <span className="ovl-state">
                  {empty ? <span className="ovl-empty">Keine Daten – Tabelle füllen</span> : o.visible ? 'Eingeblendet' : 'Aus'}
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
                  aria-label={`${name} entfernen`}
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
