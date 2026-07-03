// Global time-range selector for the Economy tab. Drives every time-series; pure
// in-memory recompute (no refetch). Segmented control in the shadcn idiom.
import type { RangeKey } from "../../lib/circlesData";

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "7d", label: "7D" },
  { key: "30d", label: "30D" },
  { key: "90d", label: "90D" },
  { key: "all", label: "All" },
];

export function RangeSelector({ value, onChange }: { value: RangeKey; onChange: (r: RangeKey) => void }) {
  return (
    <div className="flex rounded-[10px] border border-border p-0.5">
      {RANGES.map((r) => (
        <button
          key={r.key}
          onClick={() => onChange(r.key)}
          className={`rounded-[7px] px-2.5 py-1 text-[11px] font-medium transition ${
            value === r.key ? "bg-[#00498B] text-white" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
