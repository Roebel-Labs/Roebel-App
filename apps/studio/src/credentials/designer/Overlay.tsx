// Selection layer over the card canvas: click to select, drag to move (snaps to the card's edges and
// centre lines and to other elements; Alt moves freely), corner handles scale, side handles change
// the width, the knob rotates (Shift: 15° steps). Coordinates are converted to card units.
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { LOGO_SLOT_ASSET, hitTest, updateLayer, type CardDesign, type Layer } from '@roebel/card-design';
import { t } from '../../i18n';
import { moveLayerTo, resizeLayer, rotateLayer, type Guides, type Handle } from './geometry';

type Drag =
  | { kind: 'move'; start: Layer; px: number; py: number; key: string; moved: boolean }
  | { kind: 'resize'; handle: Handle; start: Layer; px: number; py: number; key: string }
  | { kind: 'rotate'; start: Layer; px: number; py: number; key: string };

const HANDLES: Handle[] = ['nw', 'ne', 'sw', 'se', 'e', 'w'];
let dragSeq = 0;

export function Overlay({
  design, selected, scale, onSelect, apply, onEditText, onDropFile,
}: {
  design: CardDesign;
  selected: string | null;
  /** CSS pixels per card unit. */
  scale: number;
  onSelect: (id: string | null) => void;
  apply: (fn: (d: CardDesign) => CardDesign, key?: string) => void;
  onEditText?: (id: string) => void;
  /** A file dropped on the card; `target` is the layer under the pointer. */
  onDropFile?: (file: File, target: string | null) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [guides, setGuides] = useState<Guides>({ v: [], h: [] });
  const [over, setOver] = useState(false);

  const toCard = (e: { clientX: number; clientY: number }) => {
    const r = root.current!.getBoundingClientRect();
    return [(e.clientX - r.left) / scale, (e.clientY - r.top) / scale] as const;
  };

  const begin = (e: ReactPointerEvent, d: Drag) => {
    e.stopPropagation();
    e.preventDefault();
    root.current?.setPointerCapture(e.pointerId);
    drag.current = d;
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const [x, y] = toCard(e);
    const id = hitTest(design, x, y);
    onSelect(id);
    const layer = design.layers.find((l) => l.id === id);
    if (layer) begin(e, { kind: 'move', start: layer, px: x, py: y, key: `move-${++dragSeq}`, moved: false });
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const [x, y] = toCard(e);
    const id = d.start.id;
    if (d.kind === 'move') {
      if (!d.moved && Math.hypot(x - d.px, y - d.py) < 2) return;
      d.moved = true;
      const m = moveLayerTo(design, d.start, x - d.px, y - d.py, e.altKey);
      setGuides(m.guides);
      apply((cur) => updateLayer(cur, id, { x: m.x, y: m.y }), d.key);
    } else if (d.kind === 'resize') {
      const patch = resizeLayer(d.start, d.handle, x - d.px, y - d.py);
      apply((cur) => updateLayer(cur, id, patch), d.key);
    } else {
      const rotation = rotateLayer(d.start, d.px, d.py, x, y, e.shiftKey);
      apply((cur) => updateLayer(cur, id, { rotation }), d.key);
    }
  };

  const end = () => {
    drag.current = null;
    setGuides({ v: [], h: [] });
  };

  const sel = design.layers.find((l) => l.id === selected) ?? null;
  const box = (l: Layer) => ({
    left: l.x * scale,
    top: l.y * scale,
    width: l.w * scale,
    height: l.h * scale,
    transform: l.rotation ? `rotate(${l.rotation}deg)` : undefined,
  });

  return (
    <div
      ref={root}
      className={`dz-overlay${over ? ' over' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={(e) => {
        const [x, y] = toCard(e);
        const id = hitTest(design, x, y);
        const l = design.layers.find((v) => v.id === id);
        if (l && l.type !== 'image') onEditText?.(l.id);
      }}
      onDragOver={(e) => {
        if (!onDropFile || !e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        const file = e.dataTransfer.files?.[0];
        if (!file || !onDropFile) return;
        e.preventDefault();
        const [x, y] = toCard(e);
        onDropFile(file, hitTest(design, x, y));
      }}
    >
      {design.layers
        .filter((l) => l.type === 'image' && l.assetId === LOGO_SLOT_ASSET)
        .map((l) => (
          <div key={`slot-${l.id}`} className="dz-slot" style={box(l)}>
            <span>{t('Logo')}</span>
          </div>
        ))}
      {guides.v.map((x) => (
        <div key={`v${x}`} className="dz-guide v" style={{ left: x * scale }} />
      ))}
      {guides.h.map((y) => (
        <div key={`h${y}`} className="dz-guide h" style={{ top: y * scale }} />
      ))}
      {sel && (
        <div className="dz-sel" style={box(sel)}>
          {HANDLES.filter((h) => sel.type !== 'image' || (h !== 'e' && h !== 'w')).map((h) => (
            <span
              key={h}
              className={`dz-handle ${h}`}
              onPointerDown={(e) => {
                const [x, y] = toCard(e);
                begin(e, { kind: 'resize', handle: h, start: sel, px: x, py: y, key: `resize-${++dragSeq}` });
              }}
            />
          ))}
          <span
            className="dz-rotate"
            title={t('Drehen')}
            onPointerDown={(e) => {
              const [x, y] = toCard(e);
              begin(e, { kind: 'rotate', start: sel, px: x, py: y, key: `rotate-${++dragSeq}` });
            }}
          />
        </div>
      )}
    </div>
  );
}
