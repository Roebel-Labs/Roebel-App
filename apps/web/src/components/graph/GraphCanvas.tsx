"use client";

import { useEffect, useMemo, useState } from "react";
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  NodeTypes,
} from "reactflow";
import "reactflow/dist/style.css";

import { useSocialGraph, type NodeStatus } from "@/hooks/useSocialGraph";
import AttesterNode from "./AttesterNode";
import CitizenNode from "./CitizenNode";

const nodeTypes: NodeTypes = {
  attester: AttesterNode,
  citizen: CitizenNode,
};

const STATUS_ORDER: Record<NodeStatus, number> = {
  active: 0,
  pending: 1,
  revoked: 2,
};

function calculateLayout(
  nodes: Array<{ id: string; type: string; isFounder: boolean; status: NodeStatus }>,
): Array<{ id: string; x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();

  const founders = nodes.filter((n) => n.isFounder && n.status === "active");
  const founderRadius = 150;
  founders.forEach((node, index) => {
    const angle = (index / Math.max(founders.length, 1)) * 2 * Math.PI;
    positions.set(node.id, {
      x: Math.cos(angle) * founderRadius,
      y: Math.sin(angle) * founderRadius,
    });
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
    positions.set(node.id, {
      x: Math.cos(angle) * currentRadius,
      y: Math.sin(angle) * currentRadius,
    });
  });

  return Array.from(positions.entries()).map(([id, pos]) => ({
    id,
    x: pos.x,
    y: pos.y,
  }));
}

function formatAgo(date: Date | null, now: number): string {
  if (!date) return "—";
  const seconds = Math.max(0, Math.floor((now - date.getTime()) / 1000));
  if (seconds < 60) return `vor ${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `vor ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `vor ${hours}h`;
}

export default function GraphCanvas() {
  const {
    nodes: graphNodes,
    edges: graphEdges,
    isLoading,
    error,
    lastUpdated,
    refresh,
  } = useSocialGraph();

  // tick the "vor Xs" label once a second so it stays accurate without a re-fetch
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const { nodes: flowNodes, edges: flowEdges } = useMemo(() => {
    if (!graphNodes.length) {
      return { nodes: [] as Node[], edges: [] as Edge[] };
    }

    const positions = calculateLayout(graphNodes);

    const nodes: Node[] = graphNodes.map((node) => {
      const position =
        positions.find((p) => p.id === node.id) ?? { x: 0, y: 0 };

      return {
        id: node.id,
        type: node.type,
        position: { x: position.x + 400, y: position.y + 300 },
        data: {
          address: node.address,
          isFounder: node.isFounder,
          status: node.status,
          label:
            node.status === "active" && node.verifiedBy
              ? `Verifiziert von ${node.verifiedBy.length} Personen`
              : undefined,
        },
      };
    });

    const revokedIds = new Set(
      graphNodes.filter((n) => n.status === "revoked").map((n) => n.id),
    );

    const edges: Edge[] = graphEdges.map((edge) => {
      const isAttesterApproval = edge.type === "attester_approved";
      const touchesRevoked =
        revokedIds.has(edge.source) || revokedIds.has(edge.target);
      const color = touchesRevoked
        ? "#9ca3af" // gray-400 — edge to/from a revoked node
        : isAttesterApproval
          ? "#f59e0b"
          : "#3b82f6";

      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: "smoothstep",
        animated: !touchesRevoked,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 15,
          height: 15,
          color,
        },
        style: {
          stroke: color,
          strokeWidth: 2,
          opacity: touchesRevoked ? 0.35 : 0.6,
        },
        label: isAttesterApproval ? "Bescheiniger ✓" : "Bürger ✓",
        labelStyle: {
          fill: color,
          fontSize: 10,
          fontWeight: 600,
        },
        labelBgStyle: {
          fill: "white",
          fillOpacity: 0.8,
        },
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

  const activeCount = graphNodes.filter((n) => n.status === "active").length;
  const attesterCount = graphNodes.filter(
    (n) => n.type === "attester" && n.status === "active",
  ).length;
  const citizenCount = graphNodes.filter(
    (n) => n.type === "citizen" && n.status === "active",
  ).length;
  const pendingCount = graphNodes.filter((n) => n.status === "pending").length;
  const revokedCount = graphNodes.filter((n) => n.status === "revoked").length;

  if (isLoading && graphNodes.length === 0) {
    return (
      <div className="h-[calc(100vh-140px)] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Lade soziales Netzwerk...</p>
        </div>
      </div>
    );
  }

  if (error && graphNodes.length === 0) {
    return (
      <div className="h-[calc(100vh-140px)] flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 text-xl mb-4">⚠️</div>
          <p className="text-red-600 font-medium">Fehler beim Laden</p>
          <p className="text-muted-foreground text-sm mt-2">{error}</p>
        </div>
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="h-[calc(100vh-140px)] flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">
            Noch keine verifizierten Bürger
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-140px)] relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.1}
        maxZoom={2}
        defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
      >
        <Background color="#aaa" gap={16} />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            const status = (node.data?.status ?? "active") as NodeStatus;
            if (status === "revoked") return "#9ca3af";
            if (status === "pending") return "#fde68a";
            if (node.type === "attester") return "#f59e0b";
            if (node.type === "citizen") return "#3b82f6";
            return "#14b8a6";
          }}
          maskColor="rgb(240, 240, 240, 0.6)"
        />
      </ReactFlow>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-card rounded-lg shadow-lg p-4 z-10 max-w-xs">
        <h3 className="font-medium text-sm mb-3">Legende</h3>

        <div className="mb-3">
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Mitglieder
          </p>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-gradient-to-br from-yellow-500 via-teal-500 to-blue-600"></div>
              <span className="text-xs">Bescheiniger</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-gradient-to-br from-blue-600 to-blue-800"></div>
              <span className="text-xs">Bürger</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded border-2 border-dashed border-yellow-400 bg-yellow-50"></div>
              <span className="text-xs">Antrag offen</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-muted border border-border"></div>
              <span className="text-xs line-through text-muted-foreground">
                Entzogen
              </span>
            </div>
          </div>
        </div>

        <div className="border-t pt-3">
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Verifizierungen
          </p>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-4 h-0.5 bg-amber-500"></div>
              <span className="text-xs">Bescheiniger Zustimmung</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-0.5 bg-blue-500"></div>
              <span className="text-xs">Bürger Zustimmung</span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="absolute top-4 right-4 bg-card rounded-lg shadow-lg p-4 z-10 min-w-[200px]">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-sm">Statistiken</h3>
          <button
            type="button"
            onClick={() => refresh()}
            disabled={isLoading}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            aria-label="Aktualisieren"
          >
            {isLoading ? "…" : "↻"}
          </button>
        </div>
        <div className="space-y-2">
          <div className="text-sm border-b pb-2">
            <span className="font-medium">{activeCount}</span> aktive Mitglieder
          </div>
          <div className="text-sm">
            <span className="font-medium">{attesterCount}</span> Bescheiniger
          </div>
          <div className="text-sm">
            <span className="font-medium">{citizenCount}</span> Bürger
          </div>
          <div className="text-sm border-t pt-2 mt-2">
            <span className="font-medium">{edges.length}</span> Verifizierungen
          </div>
          {pendingCount > 0 && (
            <div className="text-sm text-yellow-700">
              <span className="font-medium">{pendingCount}</span> offene Anträge
            </div>
          )}
          {revokedCount > 0 && (
            <div className="text-sm text-muted-foreground">
              <span className="font-medium">{revokedCount}</span> entzogen
            </div>
          )}
        </div>
        <div className="text-[10px] text-muted-foreground mt-3 pt-2 border-t">
          Aktualisiert {formatAgo(lastUpdated, now)}
        </div>
      </div>
    </div>
  );
}
