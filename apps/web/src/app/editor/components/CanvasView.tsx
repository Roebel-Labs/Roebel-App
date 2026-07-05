"use client";

// Open canvas (Figma-like): every screen of the mini app is a column, and every
// declared STATE of a screen renders as its own live frame in that column —
// like Figma frames for each state (leer/geladen/fehler/…). Pan/zoom board.
// While the AI streams a new version, the screen being rewritten shimmers and
// collapses to a single frame; the full state grid returns when the stream ends.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  computeCanvasScreens,
  type CanvasFrameSpec,
  type CanvasScreen,
} from "../lib/screens";
import { useMiniAppHost } from "../lib/useMiniAppHost";

const FRAME_W = 360;
const FRAME_H = 640;
const GAP_X = 64; // between screen columns
const GAP_Y = 48; // between state frames in a column
const GROUP_LABEL_H = 34; // screen title row
const STATE_LABEL_H = 26; // per-frame state label row
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

  const maxFrames = Math.max(1, ...screens.map((s) => s.frames.length));
  const boardW = screens.length * (FRAME_W + GAP_X) - GAP_X;
  const boardH =
    GROUP_LABEL_H + maxFrames * (FRAME_H + STATE_LABEL_H) + (maxFrames - 1) * GAP_Y;

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
      scale: Math.max(scale, 0.08),
    });
  }, [boardW, boardH, screens.length]);

  // Refit when the grid shape changes (first render, new screens, states fanning out).
  const gridSignature = `${screens.length}x${maxFrames}`;
  useEffect(() => {
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridSignature]);

  const zoomAt = useCallback((factor: number, cx?: number, cy?: number) => {
    const vp = viewportRef.current;
    setView((v) => {
      const scale = Math.min(2, Math.max(0.08, v.scale * factor));
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
        zoomAt(
          Math.exp(-e.deltaY * 0.01),
          e.clientX - (rect?.left ?? 0),
          e.clientY - (rect?.top ?? 0),
        );
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
        <div className="flex items-start" style={{ gap: GAP_X }}>
          {screens.map((s) => (
            <ScreenColumn
              key={s.name}
              screen={s}
              streaming={streaming}
              appName={appName}
              panning={panning}
            />
          ))}
        </div>
      </div>

      {screens.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="px-8 text-center">
            <p className="text-sm font-medium text-foreground">Noch keine Screens</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Sobald die erste Version gebaut ist, erscheinen hier alle Screens und ihre
              Zustände.
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

function ScreenColumn({
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
  const working = screen.phase === "writing";

  return (
    <div style={{ width: FRAME_W }} className="shrink-0">
      {/* screen group label (Figma-style) */}
      <div className="flex items-center gap-2" style={{ height: GROUP_LABEL_H }}>
        <span className="truncate text-sm font-medium text-foreground">{screen.title}</span>
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

      <div className="flex flex-col" style={{ gap: GAP_Y }}>
        {screen.frames.map((frame, i) => (
          <StateFrame
            key={`${screen.name}:${frame.state ?? i}`}
            frame={frame}
            working={working}
            title={
              frame.state
                ? `${appName} · ${screen.title} · ${frame.state}`
                : `${appName} · ${screen.title}`
            }
            stateLabel={frame.state}
            defaultState={i === 0}
            idle={screen.phase === "idle"}
            panning={panning}
          />
        ))}
      </div>
    </div>
  );
}

function StateFrame({
  frame,
  working,
  title,
  stateLabel,
  defaultState,
  idle,
  panning,
}: {
  frame: CanvasFrameSpec;
  working: boolean;
  title: string;
  stateLabel: string | null;
  defaultState: boolean;
  idle: boolean;
  panning: boolean;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  // Full bridge functionality only on settled frames — mid-stream renders are
  // static visual snapshots (app scripts haven't arrived yet anyway).
  useMiniAppHost(iframeRef, { html: frame.doc, appName: title, enabled: idle });

  return (
    <div data-canvas-frame>
      {/* state label */}
      <div className="flex items-center gap-1.5" style={{ height: STATE_LABEL_H }}>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 font-mono text-[10px]",
            defaultState
              ? "bg-primary/10 text-primary"
              : "border border-border text-muted-foreground",
          )}
        >
          {stateLabel ?? "standard"}
        </span>
      </div>

      <div
        className={cn(
          "relative overflow-hidden rounded-[14px] border bg-white shadow-sm dark:bg-[#202124]",
          working ? "border-primary/60" : "border-border",
        )}
        style={{ width: FRAME_W, height: FRAME_H }}
      >
        {frame.doc ? (
          <iframe
            ref={iframeRef}
            srcDoc={frame.doc}
            title={title}
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
