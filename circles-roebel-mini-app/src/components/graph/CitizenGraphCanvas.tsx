// Citizen-verification graph (ported from apps/web GraphCanvas → @xyflow/react).
// A bounded-height network of attester + citizen nodes with "wer-für-wen-gebürgt"
// edges. Self-contained: reads its own data via useCitizenGraph(). German throughout.
import { useEffect, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  type Node,
  type Edge,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCitizenGraph, type CgNode, type CgStatus } from "../../lib/citizen-graph";
import { Refresh } from "../icons";
import AttesterNode from "./AttesterNode";
import CitizenNode from "./CitizenNode";

const nodeTypes: NodeTypes = { attester: AttesterNode, citizen: CitizenNode };

const STATUS_ORDER: Record<CgStatus, number> = { active: 0, pending: 1, revoked: 2 };

function calculateLayout(nodes: CgNode[]): Array<{ id: string; x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();

  const founders = nodes.filter((n) => n.isFounder && n.status === "active");
  const founderRadius = 150;
  founders.forEach((node, index) => {
    const angle = (index / Math.max(founders.length, 1)) * 2 * Math.PI;
    positions.set(node.id, { x: Math.cos(angle) * founderRadius, y: Math.sin(angle) * founderRadius });
  });

  const nonFounders = nodes
    .filter((n) => !(n.isFounder && n.status === "active"))
    .slice()
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);

  const radius = 300;
  nonFounders.forEach((node, index) => {
    const ring = Math.floor(index / 8) + 1;
    const posInRing = index % 8;
    const angle = (posInRing / 8) * 2 * Math.PI;
    const currentRadius = radius + ring * 150;
    positions.set(node.id, { x: Math.cos(angle) * currentRadius, y: Math.sin(angle) * currentRadius });
  });

  return Array.from(positions.entries()).map(([id, pos]) => ({ id, x: pos.x, y: pos.y }));
}

export default function CitizenGraphCanvas() {
  const { nodes: graphNodes, edges: graphEdges, isLoading, error, refresh } = useCitizenGraph();

  const { nodes: flowNodes, edges: flowEdges } = useMemo(() => {
    if (!graphNodes.length) return { nodes: [] as Node[], edges: [] as Edge[] };

    const positions = calculateLayout(graphNodes);

    const nodes: Node[] = graphNodes.map((node) => {
      const position = positions.find((p) => p.id === node.id) ?? { x: 0, y: 0 };
      return {
        id: node.id,
        type: node.type,
        position: { x: position.x + 400, y: position.y + 300 },
        data: {
          address: node.address,
          isFounder: node.isFounder,
          status: node.status,
          label:
            node.status === "active" && node.verifiedBy?.length
              ? `Verifiziert von ${node.verifiedBy.length} Personen`
              : undefined,
        },
      };
    });

    const revokedIds = new Set(graphNodes.filter((n) => n.status === "revoked").map((n) => n.id));

    const edges: Edge[] = graphEdges.map((edge) => {
      const isAttesterApproval = edge.type === "attester_approved";
      const touchesRevoked = revokedIds.has(edge.source) || revokedIds.has(edge.target);
      const color = touchesRevoked ? "#9ca3af" : isAttesterApproval ? "#00498B" : "#3b82f6";
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: "smoothstep",
        animated: !touchesRevoked,
        markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15, color },
        style: { stroke: color, strokeWidth: 2, opacity: touchesRevoked ? 0.35 : 0.6 },
        label: isAttesterApproval ? "Bescheiniger ✓" : "Bürger ✓",
        labelStyle: { fill: color, fontSize: 10, fontWeight: 600 },
        labelBgStyle: { fill: "white", fillOpacity: 0.8 },
      };
    });

    return { nodes, edges };
  }, [graphNodes, graphEdges]);

  const [nodes, setNodes, onNodesChange] = useNodesState(flowNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowEdges);

  useEffect(() => {
    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [flowNodes, flowEdges, setNodes, setEdges]);

  if (isLoading && graphNodes.length === 0) {
    return (
      <div className="flex h-[420px] items-center justify-center rounded-[10px] border border-border bg-[#fafafa]">
        <div className="text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-b-2 border-[#00498B]" />
          <p className="text-[13px] text-muted-foreground">Lade Verifizierungsnetz…</p>
        </div>
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="flex h-[420px] items-center justify-center rounded-[10px] border border-dashed border-border text-[13px] text-muted-foreground">
        Noch keine verifizierten Bürger:innen
      </div>
    );
  }

  return (
    <div className="relative h-[420px] w-full overflow-hidden rounded-[10px] border border-border bg-[#fafafa]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        nodesConnectable={false}
        elementsSelectable={false}
        preventScrolling={false}
      >
        <Background color="#e5e5e5" gap={18} size={1} />
        <Controls showInteractive={false} className="!rounded-[8px] !border !border-border !shadow-sm" />
        <MiniMap
          pannable
          zoomable
          className="!rounded-[8px] !border !border-border"
          maskColor="rgba(245,245,245,0.7)"
          nodeColor={(n) => (n.type === "attester" ? "#f59e0b" : "#00498B")}
        />
      </ReactFlow>

      {/* Compact legend + refresh (civic counts live in the Town KPI grid) */}
      <div className="absolute bottom-3 left-3 z-10 rounded-[8px] border border-border bg-card/95 p-2.5 shadow-sm">
        <div className="flex flex-col gap-1.5 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded bg-gradient-to-br from-amber-300 to-amber-500" /> Bescheiniger:in
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded bg-[#00498B]" /> Bürger:in
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-3 bg-[#00498B]" /> hat gebürgt
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => refresh()}
        className="absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition hover:text-foreground active:scale-95"
        aria-label="Aktualisieren"
        title={error ? "Offline-Ansicht · erneut laden" : "Aktualisieren"}
      >
        <Refresh className="h-4 w-4" />
      </button>
    </div>
  );
}
