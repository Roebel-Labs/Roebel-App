import { memo } from "react";
import { Handle, Position, NodeProps } from "reactflow";

interface AttesterNodeData {
  address: string;
  isFounder: boolean;
  label?: string;
}

function AttesterNode({ data }: NodeProps<AttesterNodeData>) {
  const shortAddress = `${data.address.slice(0, 6)}...${data.address.slice(-4)}`;

  return (
    <div className="relative">
      <Handle type="target" position={Position.Top} className="w-2 h-2" />

      <div
        className={`
          px-4 py-3 rounded-lg shadow-lg border-2
          ${
            data.isFounder
              ? "bg-gradient-to-br from-yellow-500 via-teal-500 to-blue-600 border-teal-400"
              : "bg-gradient-to-br from-yellow-400 via-teal-400 to-blue-500 border-teal-300"
          }
          text-white text-sm font-medium
          min-w-[160px]
          transition-transform hover:scale-105
        `}
      >
        <div className="flex items-center gap-2 mb-1">
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
            />
          </svg>
          <span className="font-medium">Bescheiniger</span>
        </div>

        <div className="text-xs opacity-90 font-mono">{shortAddress}</div>

        {data.isFounder && (
          <div className="mt-2 text-xs bg-card/20 px-2 py-1 rounded">
            Gründungsmitglied
          </div>
        )}

        {data.label && (
          <div className="mt-1 text-xs opacity-80">{data.label}</div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="w-2 h-2" />
    </div>
  );
}

export default memo(AttesterNode);
