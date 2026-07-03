// A floating bezier edge: smooth, animated, arrow-tipped connector that meets each
// node's border (not a fixed handle) — the apps/web /graph line treatment, monochrome.
import { BaseEdge, getBezierPath, useInternalNode, type EdgeProps } from "@xyflow/react";
import { getEdgeParams } from "./floating-utils";

export default function FloatingEdge({ source, target, markerEnd, style }: EdgeProps) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  if (!sourceNode || !targetNode) return null;

  const { sx, sy, tx, ty, sourcePos, targetPos } = getEdgeParams(sourceNode, targetNode);
  const [path] = getBezierPath({
    sourceX: sx,
    sourceY: sy,
    sourcePosition: sourcePos,
    targetPosition: targetPos,
    targetX: tx,
    targetY: ty,
  });

  return <BaseEdge path={path} markerEnd={markerEnd} style={style} />;
}
