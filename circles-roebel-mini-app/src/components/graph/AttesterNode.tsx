// Attester node for the citizen-verification graph (ported from apps/web, adapted to
// @xyflow/react). Renders a gold "Bescheiniger" card with pending / revoked / founder states.
import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { CgStatus } from "../../lib/citizen-graph";

function AttesterNode({ data }: NodeProps) {
  const d = data as unknown as { address: string; isFounder: boolean; status?: CgStatus; label?: string };
  const shortAddress = `${d.address.slice(0, 6)}...${d.address.slice(-4)}`;
  const status: CgStatus = d.status ?? "active";

  const wrapperClass =
    status === "pending"
      ? "px-4 py-3 rounded-lg shadow-sm border-2 border-dashed border-yellow-400 bg-yellow-50/80 text-yellow-900 text-sm font-medium min-w-[160px] opacity-90 transition-transform hover:scale-105"
      : status === "revoked"
        ? "px-4 py-3 rounded-lg shadow-sm border-2 border-border bg-muted text-muted-foreground text-sm font-medium min-w-[160px] opacity-70 transition-transform hover:scale-105"
        : "px-4 py-3 rounded-lg shadow-lg border-2 bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-500 border-amber-300 text-amber-950 text-sm font-medium min-w-[160px] transition-transform hover:scale-105";

  return (
    <div className="relative">
      <Handle type="target" position={Position.Top} className="w-2 h-2" />

      <div className={wrapperClass}>
        <div className="flex items-center gap-2 mb-1">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
            />
          </svg>
          <span className="font-medium">Bescheiniger:in</span>
        </div>

        <div className={`text-xs opacity-90 font-mono ${status === "revoked" ? "line-through" : ""}`}>{shortAddress}</div>

        {status === "pending" && (
          <div className="mt-2 text-xs bg-yellow-200/60 text-yellow-900 px-2 py-1 rounded">Antrag offen</div>
        )}

        {status === "revoked" && (
          <div className="mt-2 text-xs bg-card text-muted-foreground px-2 py-1 rounded border border-border">Entzogen</div>
        )}

        {status === "active" && d.isFounder && (
          <div className="mt-2 text-xs bg-card/20 px-2 py-1 rounded">Gründungsmitglied</div>
        )}

        {status === "active" && d.label && <div className="mt-1 text-xs opacity-80">{d.label}</div>}
      </div>

      <Handle type="source" position={Position.Bottom} className="w-2 h-2" />
    </div>
  );
}

export default memo(AttesterNode);
