// Layout editor on the preview monitor ("Anordnen"): every layer of the preview scene is a box that can be
// moved and resized with the mouse, snapping to the frame edges, the centre and the other boxes. A split or
// picture-in-picture scene becomes a free scene on the first change (the picture stays exactly as it was).
// Mid-drag the scene lives in arrange.draft (drawn by the preview); the show state changes once, on release.

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { t } from '../../i18n';
import { cleanCrop, defaultFrame, MAX_CROP, resizeRect, sceneLayers, snapLines, snapMove, snapResize, toFreeScene, type Handle, type Rect } from '../../render/layout';
import { useShow } from '../../state/store';
import type { Crop, Frame, Scene } from '../../state/types';
import { arrange, useArrange } from './arrange';

const W = 1920;
const H = 1080;
/** Snap distance in program px (≈ 8 screen px on a 960 px monitor). */
const SNAP = 16;
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

type Drag = {
  pointerId: number;
  kind: 'move' | Handle;
  sourceId: string;
  startX: number;
  startY: number;
  /** Program px per screen px. */
  scale: number;
  start: Rect;
  /** Crop of the layer when the drag began (crop mode). */
  startCrop: Crop;
  base: Scene;
  moved: boolean;
};

const NO_CROP: Crop = { l: 0, t: 0, r: 0, b: 0 };

/**
 * Crop mode: the dragged edge cuts the picture and the box shrinks with it, so what stays visible keeps its
 * place and size. Each edge's cut is the box change as a share of the visible part of the source.
 */
export function cropDrag(start: Rect, c0: Crop, next: Rect): { rect: Rect; crop: Crop } {
  const visW = 1 - c0.l - c0.r;
  const visH = 1 - c0.t - c0.b;
  const perX = visW / start.w; // source share per program px
  const perY = visH / start.h;
  const clamp = (v: number) => Math.min(MAX_CROP, Math.max(0, v));
  const l = clamp(c0.l + (next.x - start.x) * perX);
  const r = clamp(c0.r + (start.x + start.w - (next.x + next.w)) * perX);
  const t = clamp(c0.t + (next.y - start.y) * perY);
  const b = clamp(c0.b + (start.y + start.h - (next.y + next.h)) * perY);
  // Back from the clamped cut to the box, so box and picture never drift apart at the limits.
  const x = start.x + (l - c0.l) / perX;
  const right = start.x + start.w - (r - c0.r) / perX;
  const y = start.y + (t - c0.t) / perY;
  const bottom = start.y + start.h - (b - c0.b) / perY;
  return { rect: { x, y, w: right - x, h: bottom - y }, crop: { l, t, r, b } };
}

const pct = (v: number, of: number) => `${(v / of) * 100}%`;

function framesOf(scene: Scene): Record<string, Frame> {
  const free = toFreeScene(scene, W, H);
  return free.frames ?? {};
}

function rectOf(scene: Scene, id: string): Rect {
  const l = sceneLayers(scene, W, H).find((x) => x.sourceId === id);
  return l ? l.rect : { x: 0, y: 0, w: W, h: H };
}

export function LayoutEditor({ scene }: { scene: Scene }) {
  const { state, dispatch } = useShow();
  const { selected, crop: cropping } = useArrange();
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [draft, setDraftState] = useState<Scene | null>(null);
  const [guides, setGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const shown = draft ?? scene;
  const layers = sceneLayers(shown, W, H);
  const labelOf = (id: string) => state.sources.find((s) => s.id === id)?.label ?? t('Quelle fehlt');

  const setDraft = (s: Scene | null) => {
    arrange.setDraft(s);
    setDraftState(s);
  };

  // A different preview scene: drop any half-finished drag and a selection that is not in it.
  useEffect(() => {
    setDraft(null);
    drag.current = null;
    if (selected && !scene.sourceIds.includes(selected) && scene.backgroundSourceId !== selected) arrange.select(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene.id]);
  useEffect(() => () => arrange.setDraft(null), []);

  const commit = (next: Scene) => {
    dispatch({
      type: 'updateScene',
      id: next.id,
      patch: { layout: next.layout, sourceIds: next.sourceIds, frames: next.frames, fill: undefined, backgroundSourceId: undefined },
    });
  };

  const withFrame = (base: Scene, id: string, patch: Partial<Frame>): Scene => {
    const free = toFreeScene(base, W, H);
    const frames = { ...(free.frames ?? {}) };
    const cur = frames[id] ?? { ...rectOf(free, id) };
    frames[id] = { ...cur, ...patch };
    return { ...free, frames };
  };

  const onDown = (e: ReactPointerEvent, sourceId: string, kind: Drag['kind']) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const box = ref.current!.getBoundingClientRect();
    const base = toFreeScene(scene, W, H);
    arrange.select(sourceId);
    drag.current = {
      pointerId: e.pointerId,
      kind,
      sourceId,
      startX: e.clientX,
      startY: e.clientY,
      scale: W / box.width,
      start: rectOf(base, sourceId),
      startCrop: base.frames?.[sourceId]?.crop ?? NO_CROP,
      base,
      moved: false,
    };
    ref.current!.setPointerCapture(e.pointerId);
  };

  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const dx = (e.clientX - d.startX) * d.scale;
    const dy = (e.clientY - d.startY) * d.scale;
    if (!d.moved && Math.hypot(dx, dy) < 3 * d.scale) return;
    d.moved = true;
    const others = sceneLayers(d.base, W, H)
      .filter((l) => l.sourceId !== d.sourceId)
      .map((l) => l.rect);
    const lines = snapLines(others, W, H);
    let rect: Rect;
    let gx: number | null = null;
    let gy: number | null = null;
    if (d.kind === 'move') {
      rect = { ...d.start, x: d.start.x + dx, y: d.start.y + dy };
      if (!e.altKey) ({ rect, guideX: gx, guideY: gy } = snapMove(rect, lines, SNAP));
    } else if (arrange.get().crop) {
      let next = resizeRect(d.start, d.kind, dx, dy, true);
      if (!e.altKey) ({ rect: next, guideX: gx, guideY: gy } = snapResize(next, d.kind, lines, SNAP));
      const cut = cropDrag(d.start, d.startCrop, next);
      const r = cut.rect;
      setGuides({ x: gx, y: gy });
      setDraft(withFrame(d.base, d.sourceId, { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h), crop: cleanCrop(cut.crop) }));
      return;
    } else {
      const free = e.shiftKey;
      rect = resizeRect(d.start, d.kind, dx, dy, free);
      // A corner keeps the aspect ratio: snapping one edge would bend it, so corners snap only with Shift.
      const corner = d.kind.length === 2;
      if (!e.altKey && (!corner || free)) ({ rect, guideX: gx, guideY: gy } = snapResize(rect, d.kind, lines, SNAP));
    }
    rect = { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.w), h: Math.round(rect.h) };
    setGuides({ x: gx, y: gy });
    setDraft(withFrame(d.base, d.sourceId, rect));
  };

  const onUp = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    drag.current = null;
    setGuides({ x: null, y: null });
    const next = arrange.draft();
    if (d.moved && next) commit(next);
    setDraft(null);
  };

  // Keyboard: arrows nudge (Shift = 10 px), Delete removes the layer, Escape ends arranging.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.key === 'Escape') {
        arrange.close();
        return;
      }
      if (!selected || !scene.sourceIds.concat(scene.backgroundSourceId ?? []).includes(selected)) return;
      const step = e.shiftKey ? 10 : 1;
      const delta: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      if (delta[e.key]) {
        e.preventDefault();
        const r = rectOf(toFreeScene(scene, W, H), selected);
        commit(withFrame(scene, selected, { x: r.x + delta[e.key][0], y: r.y + delta[e.key][1] }));
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        removeLayer(selected);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const removeLayer = (id: string) => {
    const free = toFreeScene(scene, W, H);
    if (free.sourceIds.length <= 1) return; // the last layer stays: remove the whole tile instead
    const { [id]: _gone, ...frames } = free.frames ?? {};
    commit({ ...free, sourceIds: free.sourceIds.filter((x) => x !== id), frames });
    arrange.select(null);
  };

  return (
    <div className="arrange" ref={ref} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerDown={() => arrange.select(null)}>
      {layers.map((l) => {
        const sel = l.sourceId === selected;
        return (
          <div
            key={l.sourceId}
            className={`arrange-box${sel ? ' sel' : ''}${sel && cropping ? ' cropping' : ''}`}
            style={{ left: pct(l.rect.x, W), top: pct(l.rect.y, H), width: pct(l.rect.w, W), height: pct(l.rect.h, H) }}
            onPointerDown={(e) => onDown(e, l.sourceId, 'move')}
            title={labelOf(l.sourceId)}
          >
            <span className="arrange-label">{labelOf(l.sourceId)}</span>
            {sel &&
              HANDLES.map((h) => (
                <span key={h} className={`arrange-handle h-${h}`} onPointerDown={(e) => onDown(e, l.sourceId, h)} />
              ))}
          </div>
        );
      })}
      {guides.x !== null && <div className="arrange-guide v" style={{ left: pct(guides.x, W) }} />}
      {guides.y !== null && <div className="arrange-guide h" style={{ top: pct(guides.y, H) }} />}
    </div>
  );
}

const RADII: Array<{ label: string; value: number }> = [
  { label: 'Eckig', value: 0 },
  { label: 'Rund', value: 24 },
  { label: 'Kreis', value: 9999 },
];
const MAX_RADIUS = 240;
const BORDER_COLORS = ['#ffffff', '#000000', '#00498b', '#e5484d', '#e8a33d', '#2fa866'];
const CROP_EDGES: Array<{ key: keyof Crop; label: string }> = [
  { key: 'l', label: 'Links' },
  { key: 'r', label: 'Rechts' },
  { key: 't', label: 'Oben' },
  { key: 'b', label: 'Unten' },
];

/**
 * A slider that previews on the monitor while it moves (through arrange.draft, like a mouse drag) and
 * writes the show state once, when it is let go.
 */
function Slider({ label, value, min, max, step = 1, unit, onPreview, onCommit }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  onPreview: (v: number) => void;
  onCommit: (v: number) => void;
}) {
  const [live, setLive] = useState<number | null>(null);
  const shown = live ?? value;
  const done = () => {
    if (live === null) return;
    onCommit(live);
    setLive(null);
  };
  return (
    <label className="arrange-slider">
      <span className="arrange-slider-label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={shown}
        onChange={(e) => {
          const v = Number(e.target.value);
          setLive(v);
          onPreview(v);
        }}
        onPointerUp={done}
        onKeyUp={done}
        onBlur={done}
      />
      <span className="arrange-slider-value num">
        {Math.round(shown)}
        {unit}
      </span>
    </label>
  );
}

/** Toolbar under the preview while arranging: layers of the scene, and settings of the selected one. */
export function ArrangeBar({ scene }: { scene: Scene }) {
  const { state, dispatch } = useShow();
  const { selected, crop: cropping } = useArrange();
  const free = toFreeScene(scene, W, H);
  const frames = framesOf(scene);
  const frame = selected ? frames[selected] : undefined;
  const layerIds = free.sourceIds;
  const labelOf = (id: string) => state.sources.find((s) => s.id === id)?.label ?? t('Quelle fehlt');
  const addable = state.sources.filter((s) => !layerIds.includes(s.id));

  const commit = (next: Scene) => {
    arrange.setDraft(null);
    dispatch({
      type: 'updateScene',
      id: next.id,
      patch: { layout: 'free', sourceIds: next.sourceIds, frames: next.frames, fill: undefined, backgroundSourceId: undefined },
    });
  };
  const withPatch = (patch: Partial<Frame>): Scene | null => {
    if (!selected) return null;
    const cur = frames[selected] ?? { ...rectOf(free, selected) };
    return { ...free, frames: { ...frames, [selected]: { ...cur, ...patch } } };
  };
  const patchFrame = (patch: Partial<Frame>) => {
    const next = withPatch(patch);
    if (next) commit(next);
  };
  /** Slider mid-move: only the preview monitor draws the change. */
  const previewFrame = (patch: Partial<Frame>) => arrange.setDraft(withPatch(patch));
  const reorder = (dir: 1 | -1) => {
    if (!selected) return;
    const i = layerIds.indexOf(selected);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= layerIds.length) return;
    const ids = [...layerIds];
    [ids[i], ids[j]] = [ids[j], ids[i]];
    commit({ ...free, sourceIds: ids });
  };
  const addLayer = (id: string) => {
    if (!id) return;
    const small = layerIds.filter((x) => {
      const f = frames[x];
      return f && (f.w < W || f.h < H);
    }).length;
    commit({ ...free, sourceIds: [...layerIds, id], frames: { ...frames, [id]: defaultFrame(W, H, small) } });
    arrange.select(id);
  };
  const remove = () => {
    if (!selected || layerIds.length <= 1) return;
    const { [selected]: _gone, ...rest } = frames;
    commit({ ...free, sourceIds: layerIds.filter((x) => x !== selected), frames: rest });
    arrange.select(null);
  };

  const i = selected ? layerIds.indexOf(selected) : -1;
  const radius = frame?.radius ?? 0;
  const fit = frame?.fit ?? 'auto';
  const crop = frame?.crop ?? NO_CROP;
  const cropped = !!cleanCrop(frame?.crop);
  const cropPatch = (key: keyof Crop, pct: number): Partial<Frame> => ({ crop: cleanCrop({ ...crop, [key]: pct / 100 }) });
  const borderWidth = frame?.borderWidth ?? 3;
  const borderColor = frame?.borderColor ?? '#ffffff';

  return (
    <div className="arrange-bar">
      <div className="arrange-layers" role="listbox" aria-label={t('Ebenen')}>
        {[...layerIds].reverse().map((id) => (
          <button
            key={id}
            role="option"
            aria-selected={id === selected}
            className={`arrange-chip${id === selected ? ' sel' : ''}`}
            onClick={() => arrange.select(id === selected ? null : id)}
          >
            {labelOf(id)}
          </button>
        ))}
        <select className="input arrange-add" value="" onChange={(e) => addLayer(e.target.value)} disabled={addable.length === 0} aria-label={t('Ebene hinzufügen')}>
          <option value="">{t('+ Ebene')}</option>
          {addable.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        {selected && i >= 0 && (
          <div className="arrange-layer-actions">
            <button className="btn ghost small" onClick={() => reorder(1)} disabled={i >= layerIds.length - 1}>
              {t('Nach vorne')}
            </button>
            <button className="btn ghost small" onClick={() => reorder(-1)} disabled={i <= 0}>
              {t('Nach hinten')}
            </button>
            <button className="btn ghost small" onClick={() => patchFrame({ x: 0, y: 0, w: W, h: H })}>
              {t('Vollbild')}
            </button>
            <button className="btn ghost small" onClick={remove} disabled={layerIds.length <= 1}>
              {t('Aus Ansicht entfernen')}
            </button>
          </div>
        )}
      </div>
      {selected && i >= 0 ? (
        <div className="arrange-panel">
          <section className="arrange-group">
            <h4>{t('Bild')}</h4>
            <div className="arrange-seg" role="group" aria-label={t('Bild im Rahmen')}>
              <button aria-pressed={fit === 'cover'} onClick={() => patchFrame({ fit: 'cover' })} title={t('Rahmen ganz füllen, Ränder werden abgeschnitten')}>
                {t('Füllen')}
              </button>
              <button aria-pressed={fit === 'contain'} onClick={() => patchFrame({ fit: 'contain' })} title={t('Ganzes Bild zeigen')}>
                {t('Einpassen')}
              </button>
            </div>
          </section>
          <section className="arrange-group">
            <h4>{t('Ecken')}</h4>
            <div className="arrange-seg" role="group" aria-label={t('Ecken')}>
              {RADII.map((r) => (
                <button
                  key={r.value}
                  aria-pressed={r.value === 0 ? radius === 0 : r.value === 9999 ? radius >= 9999 : radius > 0 && radius < 9999}
                  onClick={() => {
                    if (r.value !== 9999 || !selected) return patchFrame({ radius: r.value || undefined });
                    // Kreis: a round face cam needs a square box (kept around its centre, picture filling it).
                    const cur = frames[selected] ?? rectOf(free, selected);
                    const side = Math.round(Math.min(cur.w, cur.h));
                    patchFrame({ radius: 9999, x: Math.round(cur.x + (cur.w - side) / 2), y: Math.round(cur.y + (cur.h - side) / 2), w: side, h: side, fit: 'cover' });
                  }}
                >
                  {t(r.label)}
                </button>
              ))}
            </div>
            {radius < 9999 && (
              <Slider
                label={t('Radius')}
                value={Math.min(radius, MAX_RADIUS)}
                min={0}
                max={MAX_RADIUS}
                unit=" px"
                onPreview={(v) => previewFrame({ radius: v || undefined })}
                onCommit={(v) => patchFrame({ radius: v || undefined })}
              />
            )}
          </section>
          <section className="arrange-group">
            <h4>
              <label className="check">
                <input type="checkbox" checked={!!frame?.border} onChange={(e) => patchFrame({ border: e.target.checked || undefined })} />
                {t('Rahmenlinie')}
              </label>
            </h4>
            {frame?.border && (
              <>
                <Slider
                  label={t('Stärke')}
                  value={borderWidth}
                  min={1}
                  max={24}
                  unit=" px"
                  onPreview={(v) => previewFrame({ borderWidth: v })}
                  onCommit={(v) => patchFrame({ borderWidth: v })}
                />
                <div className="arrange-swatches" role="group" aria-label={t('Farbe')}>
                  {BORDER_COLORS.map((c) => (
                    <button key={c} className="arrange-swatch" style={{ background: c }} aria-pressed={borderColor.toLowerCase() === c} aria-label={c} onClick={() => patchFrame({ borderColor: c })} />
                  ))}
                  <input className="arrange-color" type="color" value={borderColor} onChange={(e) => previewFrame({ borderColor: e.target.value })} onBlur={(e) => patchFrame({ borderColor: e.target.value })} aria-label={t('Eigene Farbe')} />
                </div>
              </>
            )}
          </section>
          <section className="arrange-group">
            <h4>{t('Zuschneiden')}</h4>
            <div className="arrange-seg" role="group">
              <button aria-pressed={cropping} onClick={() => arrange.setCrop(!cropping)} title={t('Ränder im Vorschaubild ziehen, um das Bild zu beschneiden')}>
                {cropping ? t('Fertig') : t('Mit der Maus')}
              </button>
              <button onClick={() => patchFrame({ crop: undefined })} disabled={!cropped}>
                {t('Zurücksetzen')}
              </button>
            </div>
            <div className="arrange-crop">
              {CROP_EDGES.map(({ key, label }) => (
                <Slider
                  key={key}
                  label={t(label)}
                  value={crop[key] * 100}
                  min={0}
                  max={MAX_CROP * 100}
                  unit=" %"
                  onPreview={(v) => previewFrame(cropPatch(key, v))}
                  onCommit={(v) => patchFrame(cropPatch(key, v))}
                />
              ))}
            </div>
          </section>
        </div>
      ) : (
        <div className="arrange-tools hint">
          {t('Rahmen anklicken und ziehen. Ecken ziehen = Größe (Shift = frei, Alt = ohne Einrasten). Pfeiltasten verschieben.')}
        </div>
      )}
    </div>
  );
}
