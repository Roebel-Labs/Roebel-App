"use client";

import { useCallback, useMemo } from "react";
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

import { useSocialGraph } from "@/hooks/useSocialGraph";
import AttesterNode from "./AttesterNode";
import CitizenNode from "./CitizenNode";

// Define custom node types
const nodeTypes: NodeTypes = {
  attester: AttesterNode, // Committee members (have both AttesterNFT and CitizenNFT)
  citizen: CitizenNode,   // Regular citizens (only CitizenNFT)
};

// Force-directed layout algorithm (simplified)
function calculateLayout(
  nodes: Array<{ id: string; type: string; isFounder: boolean }>,
  edges: Array<{ source: string; target: string }>
): Array<{ id: string; x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const nodeArray = Array.from(nodes);

  // Place founders at center in a circle
  const founders = nodeArray.filter((n) => n.isFounder);
  const founderRadius = 150;
  founders.forEach((node, index) => {
    const angle = (index / founders.length) * 2 * Math.PI;
    positions.set(node.id, {
      x: Math.cos(angle) * founderRadius,
      y: Math.sin(angle) * founderRadius,
    });
  });

  // Place non-founders in expanding circles
  const nonFounders = nodeArray.filter((n) => !n.isFounder);
  const ringsCount = Math.ceil(Math.sqrt(nonFounders.length));
  const radius = 300;

  nonFounders.forEach((node, index) => {
    const ring = Math.floor(index / 8) + 1; // 8 nodes per ring
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

export default function GraphCanvas() {
  const { nodes: graphNodes, edges: graphEdges, isLoading, error } = useSocialGraph();

  // Convert graph data to React Flow format
  const { nodes: flowNodes, edges: flowEdges } = useMemo(() => {
    if (!graphNodes.length) {
      return { nodes: [], edges: [] };
    }

    // Calculate positions
    const positions = calculateLayout(graphNodes, graphEdges);

    // Create React Flow nodes
    const nodes: Node[] = graphNodes.map((node) => {
      const position = positions.find((p) => p.id === node.id) || { x: 0, y: 0 };

      return {
        id: node.id,
        type: node.type,
        position: { x: position.x + 400, y: position.y + 300 }, // Center offset
        data: {
          address: node.address,
          isFounder: node.isFounder,
          label: node.verifiedBy
            ? `Verifiziert von ${node.verifiedBy.length} Personen`
            : undefined,
        },
      };
    });

    // Create React Flow edges with enhanced styling
    const edges: Edge[] = graphEdges.map((edge) => {
      const isAttesterApproval = edge.type === "attester_approved";
      const color = isAttesterApproval ? "#f59e0b" : "#3b82f6"; // amber-500 for attesters, blue for citizens

      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: "smoothstep",
        animated: true, // Animate approval flows
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 15,
          height: 15,
          color: color,
        },
        style: {
          stroke: color,
          strokeWidth: 2,
          opacity: 0.6,
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

  // Update nodes when graph data changes
  useMemo(() => {
    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [flowNodes, flowEdges, setNodes, setEdges]);

  if (isLoading) {
    return (
      <div className="h-[calc(100vh-140px)] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Lade soziales Netzwerk...</p>
        </div>
      </div>
    );
  }

  if (error) {
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
          <p className="text-muted-foreground">Noch keine verifizierten Bürger</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-140px)]">
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
            if (node.type === "attester") return "#f59e0b"; // amber-500
            if (node.type === "citizen") return "#3b82f6"; // blue-500
            return "#14b8a6"; // teal-500 for dual role
          }}
          maskColor="rgb(240, 240, 240, 0.6)"
        />
      </ReactFlow>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-card rounded-lg shadow-lg p-4 z-10 max-w-xs">
        <h3 className="font-medium text-sm mb-3">Legende</h3>

        {/* Nodes */}
        <div className="mb-3">
          <p className="text-xs font-medium text-muted-foreground mb-2">Mitglieder</p>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-gradient-to-br from-yellow-500 via-teal-500 to-blue-600"></div>
              <span className="text-xs">Bescheiniger</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-gradient-to-br from-blue-600 to-blue-800"></div>
              <span className="text-xs">Bürger</span>
            </div>
          </div>
        </div>

        {/* Edges */}
        <div className="border-t pt-3">
          <p className="text-xs font-medium text-muted-foreground mb-2">Verifizierungen</p>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  d="M5 12 L19 12"
                  stroke="#f59e0b"
                  strokeWidth="2"
                  markerEnd="url(#arrow-amber)"
                />
                <defs>
                  <marker id="arrow-amber" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
                    <polygon points="0 0, 10 3, 0 6" fill="#f59e0b" />
                  </marker>
                </defs>
              </svg>
              <span className="text-xs">Bescheiniger Zustimmung</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  d="M5 12 L19 12"
                  stroke="#3b82f6"
                  strokeWidth="2"
                  markerEnd="url(#arrow-blue)"
                />
                <defs>
                  <marker id="arrow-blue" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
                    <polygon points="0 0, 10 3, 0 6" fill="#3b82f6" />
                  </marker>
                </defs>
              </svg>
              <span className="text-xs">Bürger Zustimmung</span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="absolute top-4 right-4 bg-card rounded-lg shadow-lg p-4 z-10">
        <h3 className="font-medium text-sm mb-3">Statistiken</h3>
        <div className="space-y-2">
          <div className="text-sm border-b pb-2">
            <span className="font-medium">{nodes.length}</span> Mitglieder gesamt
          </div>
          <div className="text-sm">
            <span className="font-medium">
              {nodes.filter((n) => n.type === "attester").length}
            </span>{" "}
            Bescheiniger
          </div>
          <div className="text-sm">
            <span className="font-medium">
              {nodes.filter((n) => n.type === "citizen").length}
            </span>{" "}
            Bürger
          </div>
          <div className="text-sm border-t pt-2 mt-2">
            <span className="font-medium">{edges.length}</span> Verifizierungen
          </div>
        </div>
      </div>
    </div>
  );
}
