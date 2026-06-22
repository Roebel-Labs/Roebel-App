// Draggable / zoomable trust graph on React Flow (same engine as apps/web /graph),
// with the mini-app's monochrome card nodes: a navy group hub, member cards carrying
// the real Circles avatar + name, and smooth animated arrow-edges. Hub → spoke radial
// layout; pan, pinch-zoom and the zoom Controls keep it readable instead of condensed.
import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  type Node,
  type Edge,
  type NodeProps,
  type NodeTypes,
  type EdgeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Avatar } from "./ui";
import { Globe, Check } from "./icons";
import FloatingEdge from "./graph/FloatingEdge";

export interface RadialNode {
  id: string;
  label: string; // shown under the avatar (name, or short address)
  sub?: string;
  tone: "verified" | "attester" | "open" | "real" | "placeholder";
  dashed?: boolean;
  address?: string; // for the Circles avatar lookup / initials fallback
  name?: string | null; // real profile name (initials fallback when no picture)
  imageUrl?: string | null; // Circles profile picture
}

type ToneStyle = { card: string; ring: string; badge: boolean; navy: boolean };
const TONE: Record<RadialNode["tone"], ToneStyle> = {
  attester: { card: "border-[#194383]", ring: "ring-2 ring-[#194383]", badge: true, navy: true },
  real: { card: "border-[#194383]", ring: "ring-2 ring-[#194383]", badge: true, navy: true },
  verified: { card: "border-[#194383]/30", ring: "ring-2 ring-[#194383]/40", badge: false, navy: true },
  open: { card: "border-dashed border-neutral-300", ring: "ring-1 ring-neutral-200", badge: false, navy: false },
  placeholder: { card: "border-dashed border-neutral-300", ring: "ring-1 ring-neutral-200", badge: false, navy: false },
};
const TONE_RANK: Record<RadialNode["tone"], number> = { attester: 0, real: 0, verified: 1, open: 2, placeholder: 3 };

const HIDDEN_HANDLE = "!h-1 !w-1 !min-w-0 !border-0 !bg-transparent";

/* ── Custom nodes ────────────────────────────────────────────────────────────── */
function MemberNode({ data }: NodeProps) {
  const d = data as unknown as RadialNode;
  const t = TONE[d.tone];
  return (
    <div className={`flex w-[132px] flex-col items-center gap-1 rounded-[12px] border bg-card px-3 py-2.5 shadow-sm transition-transform hover:scale-105 ${t.card}`}>
      <Handle type="target" position={Position.Top} className={HIDDEN_HANDLE} isConnectable={false} />
      <div className="relative">
        <Avatar address={d.address ?? d.id} name={d.name ?? null} imageUrl={d.imageUrl ?? null} size={42} className={t.ring} />
        {t.badge && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#194383] text-white ring-2 ring-card">
            <Check className="h-2.5 w-2.5" />
          </span>
        )}
      </div>
      <span className="max-w-full truncate text-center text-xs font-semibold leading-tight text-foreground">{d.label}</span>
      {d.sub && <span className="max-w-full truncate text-center text-[10px] leading-none text-muted-foreground">{d.sub}</span>}
      <Handle type="source" position={Position.Bottom} className={HIDDEN_HANDLE} isConnectable={false} />
    </div>
  );
}

function GroupNode({ data }: NodeProps) {
  const d = data as unknown as { label: string; sub?: string; imageUrl?: string | null };
  return (
    <div className="flex w-[150px] flex-col items-center gap-1 rounded-[14px] border-2 border-[#194383] bg-[#194383] px-3 py-3 text-center text-white shadow-md">
      <Handle type="source" position={Position.Bottom} className={HIDDEN_HANDLE} isConnectable={false} />
      <Handle type="target" position={Position.Top} className={HIDDEN_HANDLE} isConnectable={false} />
      {d.imageUrl ? (
        <img src={d.imageUrl} alt="" className="h-10 w-10 rounded-full border border-white/30 bg-white object-cover" />
      ) : (
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15">
          <Globe className="h-5 w-5" />
        </span>
      )}
      <span className="max-w-[120px] truncate text-[13px] font-bold leading-tight">{d.label}</span>
      {d.sub && <span className="text-[10px] font-medium text-white/70">{d.sub}</span>}
    </div>
  );
}

const nodeTypes: NodeTypes = { member: MemberNode, group: GroupNode };
const edgeTypes: EdgeTypes = { floating: FloatingEdge };

const CENTER_ID = "__center";

/* ── Radial layout (positions = node centers; React Flow fitView frames it) ────── */
function radialPositions(nodes: RadialNode[]): Record<string, { x: number; y: number }> {
  const pos: Record<string, { x: number; y: number }> = {};
  const ring = (arr: RadialNode[], radius: number, offset = 0) =>
    arr.forEach((nd, i) => {
      const a = (i / Math.max(arr.length, 1)) * 2 * Math.PI - Math.PI / 2 + offset;
      pos[nd.id] = { x: Math.cos(a) * radius, y: Math.sin(a) * radius };
    });

  const inner = nodes.filter((n) => n.tone === "attester" || n.tone === "real");
  const rest = nodes.filter((n) => !(n.tone === "attester" || n.tone === "real"));
  if (inner.length) ring(inner, 240);
  const outerBase = inner.length ? 470 : 320;
  if (rest.length <= 9) {
    ring(rest, outerBase);
  } else {
    const half = Math.ceil(rest.length / 2);
    ring(rest.slice(0, half), outerBase - 60);
    ring(rest.slice(half), outerBase + 200, Math.PI / half);
  }
  return pos;
}

export default function RadialGraph({
  center,
  nodes,
  emptyLabel = "no members yet",
}: {
  center: { label: string; sub?: string; imageUrl?: string | null };
  nodes: RadialNode[];
  emptyLabel?: string;
}) {
  const { rfNodes, rfEdges } = useMemo(() => {
    const ordered = [...nodes].sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone]);
    const pos = radialPositions(ordered);

    const rfNodes: Node[] = [
      { id: CENTER_ID, type: "group", position: { x: -75, y: -55 }, data: center as unknown as Record<string, unknown>, draggable: true },
      ...ordered.map((nd) => ({
        id: nd.id,
        type: "member",
        // anchor ≈ node centre on the computed ring
        position: { x: (pos[nd.id]?.x ?? 0) - 66, y: (pos[nd.id]?.y ?? 0) - 46 },
        data: nd as unknown as Record<string, unknown>,
        draggable: true,
      })),
    ];

    const rfEdges: Edge[] = ordered.map((nd) => {
      const navy = TONE[nd.tone].navy;
      const color = navy ? "#194383" : "#A3A3A3";
      return {
        id: `e-${nd.id}`,
        source: CENTER_ID,
        target: nd.id,
        type: "floating",
        animated: !nd.dashed,
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color },
        style: { stroke: color, strokeWidth: 1.75, opacity: nd.dashed ? 0.4 : 0.6, strokeDasharray: nd.dashed ? "5 5" : undefined },
      };
    });

    return { rfNodes, rfEdges };
  }, [center, nodes]);

  if (nodes.length === 0) {
    return (
      <div className="flex h-[280px] w-full items-center justify-center rounded-[10px] border border-dashed border-border text-[13px] text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="h-[440px] w-full overflow-hidden rounded-[10px] border border-border bg-[#fafafa]">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        minZoom={0.2}
        maxZoom={2}
        nodesConnectable={false}
        elementsSelectable={false}
        preventScrolling={false}
        defaultEdgeOptions={{ type: "floating" }}
      >
        <Background color="#e5e5e5" gap={18} size={1} />
        <Controls showInteractive={false} className="!rounded-[8px] !border !border-border !shadow-sm" />
        <MiniMap
          pannable
          zoomable
          className="!rounded-[8px] !border !border-border"
          maskColor="rgba(245,245,245,0.7)"
          nodeColor={(n) => (n.type === "group" ? "#194383" : TONE[(n.data as unknown as RadialNode).tone]?.navy ? "#194383" : "#d4d4d4")}
        />
      </ReactFlow>
    </div>
  );
}
