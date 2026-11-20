// A card drawn live with CanvasKit. Redraws on every change, and every animation frame only while a
// sheen moves (loop, or pointer tilt); with prefers-reduced-motion the sheen stands still.
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { drawDesign, drawHeight, type CardDesign, type FieldValues, type RenderMode, type SkImageLike } from '@roebel/card-design';
import type { Surface } from 'canvaskit-wasm';
import { t } from '../../i18n';
import { designAssets, imagesFor, loadSkia, loopPhase, makeSurface, prefersReducedMotion, shouldAnimate, tiltFromPointer, type ShineMode, type Skia } from './skia';

export interface CardCanvasProps {
  design: CardDesign;
  /** CSS width in pixels; the height follows the design's format. */
  width: number;
  mode?: RenderMode;
  values?: FieldValues;
  shine?: ShineMode;
  /** Tilt from outside (In der Hand); in 'pointer' mode without it the canvas follows the pointer itself. */
  tilt?: { x: number; y: number };
  /** Known URLs of uploaded assets (sha → url). */
  urls?: Record<string, string>;
  /** Decoded sizes of the drawn images, for the editor's hints. */
  onImages?: (images: Map<string, SkImageLike>) => void;
  className?: string;
  style?: CSSProperties;
}

export function CardCanvas({ design, width, mode = 'preview', values, shine = 'loop', tilt, urls, onImages, className, style }: CardCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const surfaceRef = useRef<Surface | null>(null);
  const [skia, setSkia] = useState<Skia | null>(null);
  const [failed, setFailed] = useState(false);
  const [images, setImages] = useState<Map<string, SkImageLike>>(() => new Map());
  const ownTilt = useRef<{ x: number; y: number } | undefined>(undefined);
  const reduced = useRef(prefersReducedMotion());

  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  const height = drawHeight(design, width);
  const pw = Math.max(1, Math.round(width * dpr));
  const ph = Math.max(1, Math.round(height * dpr));

  // Latest props for the draw function (the animation loop must not restart on every change).
  const props = useRef({ design, mode, values, tilt, images, pw });
  props.current = { design, mode, values, tilt, images, pw };

  useEffect(() => {
    let alive = true;
    loadSkia().then(
      (s) => alive && setSkia(s),
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
    };
  }, []);

  const assetKey = designAssets(design).join('|');
  useEffect(() => {
    if (!skia) return;
    let alive = true;
    void imagesFor(skia, props.current.design, urls).then((m) => {
      if (!alive) return;
      setImages(m);
      onImages?.(m);
    });
    return () => {
      alive = false;
    };
    // urls/onImages are read when the asset set changes.
  }, [skia, assetKey]);

  const draw = (now: number) => {
    const surface = surfaceRef.current;
    if (!skia || !surface) return;
    const p = props.current;
    const c = surface.getCanvas();
    c.clear(skia.ck.TRANSPARENT);
    try {
      drawDesign(skia.api, skia.api.wrapCanvas(c), p.design, {
        width: p.pw,
        mode: p.mode,
        values: p.values,
        images: p.images,
        fonts: skia.fonts,
        shinePhase: shine === 'static' ? 0.35 : loopPhase(now),
        tilt: p.tilt ?? ownTilt.current,
        reducedMotion: reduced.current,
      });
    } catch {
      // A broken design never takes the editor down.
    }
    surface.flush();
  };

  // Surface per canvas element (the element is re-created when the pixel size changes).
  useEffect(() => {
    const el = canvasRef.current;
    if (!skia || !el) return;
    const s = makeSurface(skia.ck, el);
    if (!s) {
      setFailed(true);
      return;
    }
    surfaceRef.current = s;
    draw(performance.now());
    return () => {
      surfaceRef.current = null;
      s.delete();
    };
  }, [skia, pw, ph]);

  const animate = shouldAnimate(design, shine, reduced.current);
  useEffect(() => {
    if (!skia) return;
    if (!animate) {
      draw(performance.now());
      return;
    }
    // Only while the canvas is on screen and the window visible: a hidden section stops drawing.
    let raf = 0;
    let visible = true;
    const el = canvasRef.current;
    const io = el && typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver(([entry]) => {
          visible = entry?.isIntersecting ?? true;
          if (visible && !raf) raf = requestAnimationFrame(tick);
        })
      : null;
    const onVis = () => {
      if (!document.hidden && visible && !raf) raf = requestAnimationFrame(tick);
    };
    function tick(now: number) {
      raf = 0;
      if (!visible || document.hidden) return;
      draw(now);
      raf = requestAnimationFrame(tick);
    }
    if (el) io?.observe(el);
    document.addEventListener('visibilitychange', onVis);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      io?.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    };
  });

  const onPointerMove = shine === 'pointer' && !tilt ? (e: ReactPointerEvent<HTMLCanvasElement>) => (ownTilt.current = tiltFromPointer(e.currentTarget.getBoundingClientRect(), e.clientX, e.clientY)) : undefined;

  if (failed)
    return (
      <div className={`dz-canvas-failed ${className ?? ''}`} style={{ width, height, ...style }}>
        {t('Die Karte kann hier nicht gezeichnet werden.')}
      </div>
    );
  return (
    <canvas
      key={`${pw}x${ph}`}
      ref={canvasRef}
      width={pw}
      height={ph}
      className={className}
      style={{ width, height, display: 'block', ...style }}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerMove ? () => (ownTilt.current = undefined) : undefined}
    />
  );
}
