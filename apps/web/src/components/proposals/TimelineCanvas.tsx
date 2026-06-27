"use client";

import { useMemo } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  type Edge,
  type Node,
  type NodeTypes,
} from "reactflow";
import "reactflow/dist/style.css";

import { ContractsInfoDialog } from "./ContractsInfoDialog";
import {
  ProposalBlockNode,
  type ProposalBlockNodeData,
} from "./ProposalBlockNode";
import { de } from "@/lib/translations/de";
import type { SerializedProposalGroup } from "@/lib/governance-events";

interface TimelineCanvasProps {
  groups: SerializedProposalGroup[];
}

const NODE_TYPES: NodeTypes = {
  proposalBlock: ProposalBlockNode,
};

const NODE_SPACING_X = 380;

export function TimelineCanvas({ groups }: TimelineCanvasProps) {
  const { nodes, edges } = useMemo(() => {
    // Oldest on the left, newest on the right (blockchain convention).
    const ordered = [...groups].sort(
      (a, b) => Number(BigInt(a.latestBlock) - BigInt(b.latestBlock))
    );

    const flowNodes: Node<ProposalBlockNodeData>[] = ordered.map(
      (group, index) => ({
        id: group.proposalId,
        type: "proposalBlock",
        position: { x: index * NODE_SPACING_X, y: 0 },
        data: {
          proposal: group.proposal,
          proposalId: group.proposalId,
          events: group.events,
        },
        draggable: false,
        selectable: false,
      })
    );

    const flowEdges: Edge[] = [];
    for (let i = 0; i < ordered.length - 1; i++) {
      const source = ordered[i];
      const target = ordered[i + 1];
      flowEdges.push({
        id: `chain-${source.proposalId}-${target.proposalId}`,
        source: source.proposalId,
        target: target.proposalId,
        type: "smoothstep",
        animated: true,
        style: {
          stroke: "#7ABBF2",
          strokeWidth: 2,
          strokeDasharray: "6 6",
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 14,
          height: 14,
          color: "#7ABBF2",
        },
      });
    }

    return { nodes: flowNodes, edges: flowEdges };
  }, [groups]);

  if (nodes.length === 0) {
    return (
      <div className="relative h-full w-full bg-card">
        <div className="flex h-full items-center justify-center">
          <p className="max-w-md text-center text-sm text-muted-foreground">
            {de.governance.emptyState}
          </p>
        </div>
        <div className="absolute bottom-4 right-4 z-10">
          <ContractsInfoDialog />
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-background">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        minZoom={0.25}
        maxZoom={1.5}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
        <Controls showInteractive={false} className="!shadow-md" />
        <MiniMap
          pannable
          zoomable
          nodeColor="#00498B"
          maskColor="rgb(0,0,0,0.05)"
          className="!border !border-border !bg-card !shadow-md"
        />
      </ReactFlow>

      <div className="pointer-events-none absolute left-4 top-4 z-10 max-w-xs">
        <div className="pointer-events-auto rounded-lg border border-border bg-card/90 px-3 py-2 text-xs text-muted-foreground shadow-sm backdrop-blur">
          <p className="font-medium text-foreground">
            {de.governance.canvasHint}
          </p>
          <p className="mt-0.5">{de.governance.canvasHintSub}</p>
        </div>
      </div>

      <div className="absolute bottom-4 right-4 z-10">
        <ContractsInfoDialog />
      </div>
    </div>
  );
}
