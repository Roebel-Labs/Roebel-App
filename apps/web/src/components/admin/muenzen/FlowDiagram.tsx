"use client";

import ReactFlow, { Background, Controls, MarkerType, Position, type Edge, type Node } from "reactflow";
import "reactflow/dist/style.css";
import { FLOW_COLORS } from "@/lib/muenzen/constants";
import { fmtRcrc } from "./format";

export interface FlowTotals {
  mint: number;
  earn: number;
  spend: number;
  topup: number;
  peer: number;
}

const nodeBase = {
  sourcePosition: Position.Right,
  targetPosition: Position.Left,
  style: {
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 10,
    padding: "8px 12px",
    border: "1px solid hsl(var(--border))",
    color: "#0f172a",
  },
};

function tone(bg: string) {
  return { ...nodeBase.style, background: bg };
}

export function FlowDiagram({ totals }: { totals: FlowTotals }) {
  const nodes: Node[] = [
    { id: "safe", position: { x: 0, y: 90 }, data: { label: "Stadtkasse" }, ...nodeBase, style: tone("#dbe4f3") },
    { id: "mint", position: { x: 250, y: -40 }, data: { label: "Prägung" }, ...nodeBase, style: tone("#e0f2fe") },
    { id: "funder", position: { x: 250, y: 90 }, data: { label: "Funder" }, ...nodeBase, style: tone("#fef3c7") },
    { id: "citizens", position: { x: 520, y: 90 }, data: { label: "Bürger:innen" }, ...nodeBase, style: tone("#dcfce7") },
    { id: "sink", position: { x: 790, y: 90 }, data: { label: "Lootboxen" }, ...nodeBase, style: tone("#fee2e2") },
  ];

  const mk = (
    id: string,
    source: string,
    target: string,
    label: string,
    value: number,
    color: string,
  ): Edge => ({
    id,
    source,
    target,
    label: `${label} · ${fmtRcrc(value)}`,
    animated: value > 0,
    style: { stroke: color, strokeWidth: value > 0 ? 2 : 1, opacity: value > 0 ? 1 : 0.4 },
    labelStyle: { fontSize: 11, fill: "hsl(var(--foreground))" },
    labelBgStyle: { fill: "hsl(var(--card))", fillOpacity: 0.85 },
    markerEnd: { type: MarkerType.ArrowClosed, color },
  });

  const edges: Edge[] = [
    mk("topup", "safe", "funder", "Auffüllung", totals.topup, FLOW_COLORS.reserve),
    mk("mint", "mint", "citizens", "Prägung", totals.mint, FLOW_COLORS.mint),
    mk("earn", "funder", "citizens", "Belohnungen", totals.earn, FLOW_COLORS.earn),
    mk("spend", "citizens", "sink", "Kauf", totals.spend, FLOW_COLORS.spend),
    mk("recycle", "sink", "funder", "Erlös", totals.spend, FLOW_COLORS.spend),
  ];

  return (
    <div style={{ height: 360 }} className="rounded-md border border-border bg-muted/20">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
        minZoom={0.5}
        maxZoom={1.5}
      >
        <Background gap={16} color="hsl(var(--border))" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
