"use client";

// Open canvas (Figma-like): every screen of the mini app renders as its own
// frame on a pannable/zoomable board. While the AI streams a new version, the
// frames it is currently rewriting shimmer; screens whose fresh markup already
// arrived swap to the new state mid-stream.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { computeCanvasScreens, type CanvasScreen } from "../lib/screens";
import { useMiniAppHost } from "../lib/useMiniAppHost";

const FRAME_W = 360;
const FRAME_H = 640;
const GAP = 64;
const LABEL_H = 30;
const FIT_PADDING = 56;

export function CanvasView({
  baseHtml,
  stream,
  streaming,
  appName,
}: {
  baseHtml: string | null;
  stream: string;
  streaming: boolean;
  appName: string;
}) {
  const screens = useMemo(
    () => computeCanvasScreens(baseHtml, stream, streaming),
    [baseHtml, stream, streaming],
  );

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState({ x: FIT_PADDING, y: FIT_PADDING, scale: 0.6 });
  const [panning, setPanning] = useState(false);
  const panStart = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  const boardW = screens.length * (FRAME_W + GAP) - GAP;
  const boardH = FRAME_H + LABEL_H;

  const fit = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp || screens.length === 0) return;
    const scale = Math.min(
      (vp.clientWidth - FIT_PADDING * 2) / boardW,
      (vp.clientHeight - FIT_PADDING * 2) / boardH,
      1,
    );
    setView({
      x: (vp.clientWidth - boardW * scale) / 2,
      y: (vp.clientHeight - boardH * scale) / 2,
      scale: Math.max(scale, 0.1),
    });
  }, [boardW, boardH, screens.length]);

  // Fit whenever the number of frames changes (first render, new screens).
  useEffect(() => {
    fit();
  }, [screens.length, fit]);

  const zoomAt = useCallback((factor: number, cx?: number, cy?: number) => {
    const vp = viewportRef.current;
    setView((v) => {
      const scale = Math.min(2, Math.max(0.1, v.scale * factor));
      const px = cx ?? (vp ? vp.clientWidth / 2 : 0);
      const py = cy ?? (vp ? vp.clientHeight / 2 : 0);
      // Keep the point under the cursor stable while zooming.
      const ratio = scale / v.scale;
      return { scale, x: px - (px - v.x) * ratio, y: py - (py - v.y) * ratio };
    });
  }, []);

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const rect = viewportRef.current?.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - (rect?.left ?? 0), e.clientY - (rect?.top ?? 0));
      } else {
        setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
      }
    },
    [zoomAt],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Pan only when grabbing the board background, not a frame.
      if ((e.target as HTMLElement).closest("[data-canvas-frame]")) return;
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      panStart.current = { px: e.clientX, py: e.clientY, x: view.x, y: view.y };
      setPanning(true);
    },
    [view.x, view.y],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const s = panStart.current;
    if (!s) return;
    setView((v) => ({ ...v, x: s.x + (e.clientX - s.px), y: s.y + (e.clientY - s.py) }));
  }, []);

  const endPan = useCallback(() => {
    panStart.current = null;
    setPanning(false);
  }, []);

  return (
    <div
      ref={viewportRef}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPan}
      onPointerLeave={endPan}
      className={cn(
        "relative min-h-0 flex-1 touch-none overflow-hidden rounded-[10px] border border-border bg-background",
        panning ? "cursor-grabbing" : "cursor-grab",
      )}
    >
      <style>{`@keyframes netizenShimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }`}</style>

      {/* Bauplan grid */}
      <div
        aria-hidden
        className="absolute inset-0 [background-size:24px_24px] [background-image:linear-gradient(to_right,rgba(0,73,139,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,73,139,0.06)_1px,transparent_1px)] dark:[background-image:linear-gradient(to_right,rgba(122,187,242,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(122,187,242,0.06)_1px,transparent_1px)]"
      />

      {/* board */}
      <div
        className="absolute left-0 top-0"
        style={{
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
          transformOrigin: "0 0",
          width: boardW,
          height: boardH,
        }}
      >
        <div className="flex" style={{ gap: GAP }}>
          {screens.map((s) => (
            <CanvasFrame key={s.name} screen={s} streaming={streaming} appName={appName} panning={panning} />
          ))}
        </div>
      </div>

      {screens.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="px-8 text-center">
            <p className="text-sm font-medium text-foreground">Noch keine Screens</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Sobald die erste Version gebaut ist, erscheinen hier alle Screens der App.
            </p>
          </div>
        </div>
      ) : null}

      {/* zoom controls */}
      <div className="absolute bottom-3 right-3 flex items-center gap-0.5 rounded-[10px] border border-border bg-card p-0.5 shadow-sm">
        <button
          type="button"
          onClick={() => zoomAt(1 / 1.25)}
          aria-label="Verkleinern"
          className="flex h-7 w-7 items-center justify-center rounded-[8px] text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="w-11 text-center font-mono text-[11px] text-muted-foreground">
          {Math.round(view.scale * 100)}%
        </span>
        <button
          type="button"
          onClick={() => zoomAt(1.25)}
          aria-label="Vergrößern"
          className="flex h-7 w-7 items-center justify-center rounded-[8px] text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={fit}
          aria-label="Einpassen"
          className="flex h-7 w-7 items-center justify-center rounded-[8px] text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function CanvasFrame({
  screen,
  streaming,
  appName,
  panning,
}: {
  screen: CanvasScreen;
  streaming: boolean;
  appName: string;
  panning: boolean;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  // Full bridge functionality only on settled frames — mid-stream renders are
  // static visual snapshots (app scripts haven't arrived yet anyway).
  useMiniAppHost(iframeRef, {
    html: screen.doc,
    appName: `${appName} · ${screen.title}`,
    enabled: screen.phase === "idle",
  });

  const working = screen.phase === "writing";

  return (
    <div data-canvas-frame style={{ width: FRAME_W }} className="shrink-0">
      {/* frame label (Figma-style) */}
      <div className="flex items-center gap-2" style={{ height: LABEL_H }}>
        <span className="truncate text-xs font-medium text-muted-foreground">{screen.title}</span>
        <span className="font-mono text-[10px] text-muted-foreground/60">{screen.name}</span>
        {working ? (
          <span className="ml-auto flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[10px] text-primary">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            wird bearbeitet…
          </span>
        ) : screen.phase === "done-changed" && streaming ? (
          <span className="ml-auto rounded-full bg-success/10 px-2 py-0.5 font-mono text-[10px] text-success">
            aktualisiert
          </span>
        ) : null}
      </div>

      <div
        className={cn(
          "relative overflow-hidden rounded-[14px] border bg-white shadow-sm dark:bg-[#202124]",
          working ? "border-primary/60" : "border-border",
        )}
        style={{ width: FRAME_W, height: FRAME_H }}
      >
        {screen.doc ? (
          <iframe
            ref={iframeRef}
            srcDoc={screen.doc}
            title={`Screen: ${screen.title}`}
            sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
            className="h-full w-full border-0 bg-white"
            style={panning ? { pointerEvents: "none" } : undefined}
          />
        ) : (
          <div className="flex h-full flex-col gap-3 p-5">
            {/* skeleton placeholder while the screen streams in for the first time */}
            <div className="h-6 w-2/5 rounded bg-muted" />
            <div className="h-24 rounded-[10px] bg-muted" />
            <div className="h-4 w-3/5 rounded bg-muted" />
            <div className="h-10 rounded-[10px] bg-muted" />
          </div>
        )}

        {/* shimmer sweep while the AI works on this screen */}
        {working ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(105deg, transparent 40%, rgba(122,187,242,0.35) 50%, transparent 60%)",
              backgroundSize: "200% 100%",
              animation: "netizenShimmer 1.4s linear infinite",
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
