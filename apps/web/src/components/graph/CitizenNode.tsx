import { memo } from "react";
import { Handle, Position, NodeProps } from "reactflow";

interface CitizenNodeData {
  address: string;
  isFounder: boolean;
  label?: string;
}

function CitizenNode({ data }: NodeProps<CitizenNodeData>) {
  const shortAddress = `${data.address.slice(0, 6)}...${data.address.slice(-4)}`;

  return (
    <div className="relative">
      <Handle type="target" position={Position.Top} className="w-2 h-2" />

      <div
        className={`
          px-4 py-3 rounded-lg shadow-lg border-2
          ${
            data.isFounder
              ? "bg-gradient-to-br from-blue-600 to-blue-800 border-blue-400"
              : "bg-gradient-to-br from-blue-500 to-blue-700 border-blue-300"
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
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
            />
          </svg>
          <span className="font-medium">Bürger</span>
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

export default memo(CitizenNode);
