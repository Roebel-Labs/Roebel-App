"use client";

import * as React from "react";
import { shortAddr } from "@/lib/muenzen/constants";
import { fmt } from "./format";

export interface GraphNode {
  id: string;
  name: string | null;
  kind: string;
  isAttester: boolean;
  rcrc: number;
  score: number;
  trustIn: number;
  trustOut: number;
}
export interface GraphEdge {
  source: string;
  target: string;
}

const W = 820;
const H = 540;

const KIND_COLOR: Record<string, string> = {
  group: "#194383",
  citizen: "#16a34a",
  operator: "#8b5cf6",
  holder: "#64748b",
};
const KIND_LABEL: Record<string, string> = {
  group: "Gruppe (Röbel Münzen)",
  citizen: "Bürger:in (Gate)",
  operator: "Operator",
  holder: "Halter",
};

interface Pt {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** Compact Fruchterman–Reingold-style force layout (zero dependencies). */
function layout(nodes: GraphNode[], edges: GraphEdge[]): Pt[] {
  const n = nodes.length;
  const pos: Pt[] = nodes.map((_, i) => {
    const a = (i / Math.max(1, n)) * 2 * Math.PI;
    const r = Math.min(W, H) * 0.32;
    return { x: W / 2 + Math.cos(a) * r, y: H / 2 + Math.sin(a) * r, vx: 0, vy: 0 };
  });
  const idx = new Map(nodes.map((nd, i) => [nd.id, i]));
  const groupIdx = nodes.findIndex((nd) => nd.kind === "group");
  const k = Math.sqrt((W * H) / Math.max(1, n));

  for (let it = 0; it < 320; it++) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = pos[i].x - pos[j].x;
        let dy = pos[i].y - pos[j].y;
        let d = Math.hypot(dx, dy) || 0.01;
        const f = ((k * k) / d) * 0.02;
        const ux = dx / d;
        const uy = dy / d;
        pos[i].vx += ux * f;
        pos[i].vy += uy * f;
        pos[j].vx -= ux * f;
        pos[j].vy -= uy * f;
      }
    }
    for (const e of edges) {
      const a = idx.get(e.source);
      const b = idx.get(e.target);
      if (a == null || b == null) continue;
      let dx = pos[a].x - pos[b].x;
      let dy = pos[a].y - pos[b].y;
      let d = Math.hypot(dx, dy) || 0.01;
      const f = ((d * d) / k) * 0.0032;
      const ux = dx / d;
      const uy = dy / d;
      pos[a].vx -= ux * f;
      pos[a].vy -= uy * f;
      pos[b].vx += ux * f;
      pos[b].vy += uy * f;
    }
    for (let i = 0; i < n; i++) {
      pos[i].vx += (W / 2 - pos[i].x) * 0.0012;
      pos[i].vy += (H / 2 - pos[i].y) * 0.0012;
      pos[i].x += Math.max(-16, Math.min(16, pos[i].vx));
      pos[i].y += Math.max(-16, Math.min(16, pos[i].vy));
      pos[i].vx *= 0.86;
      pos[i].vy *= 0.86;
    }
    if (groupIdx >= 0) {
      pos[groupIdx].x = W / 2;
      pos[groupIdx].y = H / 2;
      pos[groupIdx].vx = 0;
      pos[groupIdx].vy = 0;
    }
  }
  return pos;
}

function radius(node: GraphNode): number {
  if (node.kind === "group") return 20;
  return 7 + (Math.max(0, Math.min(100, node.score)) / 100) * 13;
}

export function TrustGraph({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const pos = React.useMemo(() => layout(nodes, edges), [nodes, edges]);
  const idx = React.useMemo(() => new Map(nodes.map((n, i) => [n.id, i])), [nodes]);
  const [view, setView] = React.useState({ x: 0, y: 0, scale: 1 });
  const [hover, setHover] = React.useState<string | null>(null);
  const drag = React.useRef<{ ox: number; oy: number } | null>(null);
  const svgRef = React.useRef<SVGSVGElement | null>(null);

  const neighbors = React.useMemo(() => {
    if (!hover) return null;
    const set = new Set<string>([hover]);
    for (const e of edges) {
      if (e.source === hover) set.add(e.target);
      if (e.target === hover) set.add(e.source);
    }
    return set;
  }, [hover, edges]);

  // Wheel zoom via a native, non-passive listener — React registers onWheel as
  // passive, so e.preventDefault() there would warn and no-op.
  React.useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.12 : 0.89;
      setView((v) => ({ ...v, scale: Math.max(0.4, Math.min(3, v.scale * factor)) }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    drag.current = { ox: e.clientX - view.x, oy: e.clientY - view.y };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    // Capture the origin locally: the setView updater can run after pointerup
    // has cleared drag.current, so never deref the ref inside it.
    const d = drag.current;
    if (!d) return;
    const nx = e.clientX - d.ox;
    const ny = e.clientY - d.oy;
    setView((v) => ({ ...v, x: nx, y: ny }));
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  if (nodes.length === 0) {
    return (
      <div className="flex h-[360px] items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
        Noch keine Vertrauensbeziehungen.
      </div>
    );
  }

  const hovered = hover ? nodes[idx.get(hover) ?? -1] : null;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full cursor-grab touch-none rounded-md border border-border bg-muted/20 active:cursor-grabbing"
        style={{ height: 540 }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
          {edges.map((e, i) => {
            const a = idx.get(e.source);
            const b = idx.get(e.target);
            if (a == null || b == null) return null;
            const active = neighbors ? neighbors.has(e.source) && neighbors.has(e.target) : false;
            return (
              <line
                key={i}
                x1={pos[a].x}
                y1={pos[a].y}
                x2={pos[b].x}
                y2={pos[b].y}
                stroke={active ? "#194383" : "#94a3b8"}
                strokeWidth={active ? 1.6 : 0.8}
                strokeOpacity={neighbors && !active ? 0.08 : 0.3}
              />
            );
          })}
          {nodes.map((node, i) => {
            const dim = neighbors ? !neighbors.has(node.id) : false;
            const r = radius(node);
            return (
              <g
                key={node.id}
                transform={`translate(${pos[i].x} ${pos[i].y})`}
                onPointerEnter={() => setHover(node.id)}
                onPointerLeave={() => setHover(null)}
                style={{ cursor: "pointer", opacity: dim ? 0.25 : 1 }}
              >
                {node.isAttester && (
                  <circle r={r + 3} fill="none" stroke="#f59e0b" strokeWidth={2} />
                )}
                <circle r={r} fill={KIND_COLOR[node.kind] ?? "#64748b"} stroke="#fff" strokeWidth={1.5}>
                  <title>
                    {(node.name || shortAddr(node.id)) +
                      ` · ${KIND_LABEL[node.kind] ?? node.kind} · Score ${node.score.toFixed(0)} · ${node.trustIn} eingehende`}
                  </title>
                </circle>
                {(node.kind === "group" || node.kind === "citizen" || r > 12) && (
                  <text
                    y={r + 11}
                    textAnchor="middle"
                    fontSize={10}
                    fill="hsl(var(--foreground))"
                    style={{ pointerEvents: "none" }}
                  >
                    {(node.name || shortAddr(node.id)).slice(0, 16)}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {Object.entries(KIND_LABEL).map(([k, label]) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: KIND_COLOR[k] }} />
            {label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full border-2 border-amber-500" />
          Attester
        </span>
        <span className="ml-auto hidden sm:inline">Scrollen = Zoom · Ziehen = Verschieben</span>
      </div>

      {/* Hover detail */}
      {hovered && (
        <div className="pointer-events-none absolute right-3 top-3 max-w-[14rem] rounded-md border border-border bg-card/95 p-3 text-xs shadow-sm backdrop-blur">
          <p className="font-semibold">{hovered.name || shortAddr(hovered.id)}</p>
          <p className="mt-0.5 text-muted-foreground">{KIND_LABEL[hovered.kind] ?? hovered.kind}</p>
          <dl className="mt-2 space-y-0.5">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Reputation</dt>
              <dd className="font-medium tabular-nums">{hovered.score.toFixed(0)}/100</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Vertrauen ein/aus</dt>
              <dd className="font-medium tabular-nums">{hovered.trustIn}/{hovered.trustOut}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Guthaben</dt>
              <dd className="font-medium tabular-nums">{fmt(hovered.rcrc)} RCRC</dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
