// An agent's own picture: choose a file (or drop it), position it in a square with drag and a zoom slider,
// draw the crop into 512×512, export a JPEG and upload it. Used inside the character picker ("Eigenes Bild")
// and on its own for "Bild ändern" / "Eigenes Bild verwenden".
import { useEffect, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { t } from '../i18n';
import { IconClose, IconUpload } from '../ui/shell/line-icons';

export const PICTURE_ACCEPT = 'image/jpeg,image/png,image/webp';
const TYPES = PICTURE_ACCEPT.split(',');
const OUT = 512;
const MIN_SIDE = 96;
/** Raw files are re-encoded before upload; this only keeps absurd files out of memory. */
const MAX_RAW = 40 * 1024 * 1024;
const VIEW = 300;

/** null when the file can be used, else a message for the person. */
export function pictureFileError(file: File): string | null {
  if (!TYPES.includes(file.type)) return t('Bitte nimm ein JPEG-, PNG- oder WebP-Bild.');
  if (file.size > MAX_RAW) return t('Das Bild ist zu groß.');
  return null;
}

/** Opens the system file chooser for one picture. */
export function choosePictureFile(onFile: (f: File) => void): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = PICTURE_ACCEPT;
  input.onchange = () => {
    const f = input.files?.[0];
    if (f) onFile(f);
  };
  input.click();
}

/** The first image file of a drop, or null. */
export function droppedFile(e: DragEvent): File | null {
  const f = e.dataTransfer?.files?.[0];
  return f ?? null;
}

/** Drag-over highlighting for a drop area. */
export function useDropTarget(onFile: (f: File) => void) {
  const [over, setOver] = useState(false);
  return {
    over,
    props: {
      onDragOver: (e: DragEvent) => {
        if (!e.dataTransfer?.types?.includes('Files')) return;
        e.preventDefault();
        setOver(true);
      },
      onDragLeave: (e: DragEvent) => {
        if (e.currentTarget === e.target) setOver(false);
      },
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        setOver(false);
        const f = droppedFile(e);
        if (f) onFile(f);
      },
    },
  };
}

type Pos = { x: number; y: number };

/**
 * Square crop: the picture covers the frame, drag moves it, the slider zooms around the frame's centre. "Weiter"
 * resolves with a 512² JPEG. `busy` (uploading) disables everything and shows the progress text.
 */
export function PictureCropper({ file, busy, error, confirmLabel, onCancel, onConfirm }: {
  file: File;
  busy: boolean;
  error: string | null;
  /** Already translated. */
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: (jpeg: Blob) => void;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState<Pos>({ x: 0, y: 0 });
  const drag = useRef<{ id: number; x: number; y: number; start: Pos } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    let alive = true;
    const el = new Image();
    el.src = url;
    setImg(null);
    setLoadError(null);
    el.decode()
      .then(() => {
        if (!alive) return;
        if (Math.min(el.naturalWidth, el.naturalHeight) < MIN_SIDE) {
          setLoadError(t('Das Bild ist zu klein. Nimm eins mit mindestens 96 Pixeln Breite.'));
          return;
        }
        setZoom(1);
        setImg(el);
      })
      .catch(() => alive && setLoadError(t('Das Bild konnte nicht gelesen werden.')));
    return () => {
      alive = false;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  // Displayed size at this zoom (cover at zoom 1).
  const scale = img ? (VIEW / Math.min(img.naturalWidth, img.naturalHeight)) * zoom : 1;
  const w = img ? img.naturalWidth * scale : VIEW;
  const h = img ? img.naturalHeight * scale : VIEW;
  const clamp = (p: Pos, cw = w, ch = h): Pos => ({ x: Math.min(0, Math.max(VIEW - cw, p.x)), y: Math.min(0, Math.max(VIEW - ch, p.y)) });

  // Centre the picture when it loads.
  useEffect(() => {
    if (img) {
      const s = VIEW / Math.min(img.naturalWidth, img.naturalHeight);
      setPos({ x: (VIEW - img.naturalWidth * s) / 2, y: (VIEW - img.naturalHeight * s) / 2 });
    }
  }, [img]);

  const changeZoom = (z: number) => {
    if (!img) return;
    // Keep the point under the frame's centre where it is.
    const cx = (VIEW / 2 - pos.x) / scale;
    const cy = (VIEW / 2 - pos.y) / scale;
    const s = (VIEW / Math.min(img.naturalWidth, img.naturalHeight)) * z;
    setZoom(z);
    setPos(clamp({ x: VIEW / 2 - cx * s, y: VIEW / 2 - cy * s }, img.naturalWidth * s, img.naturalHeight * s));
  };

  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!img || busy) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, start: pos };
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    setPos(clamp({ x: d.start.x + e.clientX - d.x, y: d.start.y + e.clientY - d.y }));
  };
  const up = () => {
    drag.current = null;
  };

  const confirm = () => {
    if (!img) return;
    const canvas = document.createElement('canvas');
    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return setLoadError(t('Das Bild konnte nicht gelesen werden.'));
    // JPEG has no transparency: a transparent PNG goes on white, not black.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, OUT, OUT);
    ctx.imageSmoothingQuality = 'high';
    const side = VIEW / scale;
    ctx.drawImage(img, -pos.x / scale, -pos.y / scale, side, side, 0, 0, OUT, OUT);
    canvas.toBlob((b) => (b ? onConfirm(b) : setLoadError(t('Das Bild konnte nicht gelesen werden.'))), 'image/jpeg', 0.88);
  };

  const shown = loadError ?? error;
  return (
    <div className="op-crop">
      <div className={`op-frame${img ? '' : ' loading'}`} style={{ width: VIEW, height: VIEW }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} aria-label={t('Bildausschnitt verschieben')}>
        {img && <img src={img.src} alt="" draggable={false} style={{ width: w, height: h, transform: `translate(${pos.x}px, ${pos.y}px)` }} />}
      </div>
      <label className="op-zoom">
        <span className="w-muted">{t('Zoom')}</span>
        <input type="range" min={1} max={4} step={0.01} value={zoom} disabled={!img || busy} onChange={(e) => changeZoom(Number(e.target.value))} aria-label={t('Zoom')} />
      </label>
      <p className="w-muted op-hint">{t('Ziehe das Bild, um den Ausschnitt zu wählen.')}</p>
      {shown && <div className="ws-error">{shown}</div>}
      <div className="op-actions">
        <button className="w-btn" onClick={onCancel} disabled={busy}>
          {t('Anderes Bild')}
        </button>
        <button className="w-btn green" onClick={confirm} disabled={!img || busy}>
          {busy ? t('Wird hochgeladen …') : confirmLabel}
        </button>
      </div>
    </div>
  );
}

/** Empty state: a drop area with a button that opens the file chooser. */
export function PictureDrop({ onFile, error }: { onFile: (f: File) => void; error?: string | null }) {
  const drop = useDropTarget(onFile);
  return (
    <div className={`op-drop${drop.over ? ' over' : ''}`} {...drop.props}>
      <IconUpload size={26} />
      <strong>{t('Bild hierher ziehen')}</strong>
      <span className="w-muted">{t('JPEG, PNG oder WebP. Du wählst danach den Ausschnitt.')}</span>
      <button className="w-btn green" onClick={() => choosePictureFile(onFile)}>
        {t('Bild auswählen')}
      </button>
      {error && <div className="ws-error">{error}</div>}
    </div>
  );
}

/**
 * On its own ("Bild ändern"): choose, crop, upload, then `onDone(url)`; `upload` resolves with the url or
 * throws with a message to show. `onDone` may return an error message (e.g. the PATCH failed).
 */
export function PictureDialog({ title, upload, onClose, onDone }: {
  /** Already translated. */
  title: string;
  upload: (jpeg: Blob) => Promise<string>;
  onClose: () => void;
  onDone: (url: string) => Promise<string | null>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose, busy]);

  const take = (f: File) => {
    const bad = pictureFileError(f);
    setError(bad);
    if (!bad) setFile(f);
  };
  const save = async (jpeg: Blob) => {
    setBusy(true);
    setError(null);
    try {
      const failed = await onDone(await upload(jpeg));
      if (failed) setError(failed);
    } catch (e) {
      setError((e as Error).message || t('Das hat nicht geklappt.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dlg-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="op-dialog" role="dialog" aria-label={title}>
        <header className="op-head">
          <strong>{title}</strong>
          <button className="w-icon" aria-label={t('Schließen')} onClick={onClose} disabled={busy}>
            <IconClose size={18} />
          </button>
        </header>
        {file ? (
          <PictureCropper file={file} busy={busy} error={error} confirmLabel={t('Übernehmen')} onCancel={() => (setFile(null), setError(null))} onConfirm={(b) => void save(b)} />
        ) : (
          <PictureDrop onFile={take} error={error} />
        )}
      </div>
    </div>
  );
}
