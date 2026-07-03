// Floating-edge geometry (React Flow v12). Computes where an edge should meet
// each node's border given the two nodes' positions, so hub→spoke lines stay
// clean in every radial direction. Adapted from the official RF floating-edges example.
import { Position, type InternalNode, type Node } from "@xyflow/react";

function getNodeIntersection(intersectionNode: InternalNode<Node>, targetNode: InternalNode<Node>) {
  const w = (intersectionNode.measured.width ?? 0) / 2;
  const h = (intersectionNode.measured.height ?? 0) / 2;
  const x2 = intersectionNode.internals.positionAbsolute.x + w;
  const y2 = intersectionNode.internals.positionAbsolute.y + h;
  const x1 = targetNode.internals.positionAbsolute.x + (targetNode.measured.width ?? 0) / 2;
  const y1 = targetNode.internals.positionAbsolute.y + (targetNode.measured.height ?? 0) / 2;

  const xx1 = (x1 - x2) / (2 * w) - (y1 - y2) / (2 * h);
  const yy1 = (x1 - x2) / (2 * w) + (y1 - y2) / (2 * h);
  const a = 1 / (Math.abs(xx1) + Math.abs(yy1) || 1);
  const xx3 = a * xx1;
  const yy3 = a * yy1;
  const x = w * (xx3 + yy3) + x2;
  const y = h * (-xx3 + yy3) + y2;

  return { x, y };
}

function getEdgePosition(node: InternalNode<Node>, point: { x: number; y: number }) {
  const nx = Math.round(node.internals.positionAbsolute.x);
  const ny = Math.round(node.internals.positionAbsolute.y);
  const px = Math.round(point.x);
  const py = Math.round(point.y);

  if (px <= nx + 1) return Position.Left;
  if (px >= nx + (node.measured.width ?? 0) - 1) return Position.Right;
  if (py <= ny + 1) return Position.Top;
  if (py >= ny + (node.measured.height ?? 0) - 1) return Position.Bottom;
  return Position.Top;
}

export function getEdgeParams(source: InternalNode<Node>, target: InternalNode<Node>) {
  const sourceIntersectionPoint = getNodeIntersection(source, target);
  const targetIntersectionPoint = getNodeIntersection(target, source);
  return {
    sx: sourceIntersectionPoint.x,
    sy: sourceIntersectionPoint.y,
    tx: targetIntersectionPoint.x,
    ty: targetIntersectionPoint.y,
    sourcePos: getEdgePosition(source, sourceIntersectionPoint),
    targetPos: getEdgePosition(target, targetIntersectionPoint),
  };
}
