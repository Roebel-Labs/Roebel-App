// Dependency-free SVG radial graph: a center node with leaf nodes on a circle and
// edges from center to each. Used for the town trust graph and the network-of-towns map
// (small node counts → a clean radial layout beats a heavy force-graph library).

export interface RadialNode {
  id: string;
  label: string;
  sub?: string;
  tone: "verified" | "attester" | "open" | "real" | "placeholder";
  dashed?: boolean;
}

const TONE: Record<string, { fill: string; stroke: string }> = {
  verified: { fill: "#DCFCE7", stroke: "#16A34A" },
  attester: { fill: "#E5EDF9", stroke: "#194383" },
  open: { fill: "#F1F5F9", stroke: "#94A3B8" },
  real: { fill: "#194383", stroke: "#194383" },
  placeholder: { fill: "#F8FAFC", stroke: "#CBD5E1" },
};

export default function RadialGraph({
  center,
  nodes,
  emptyLabel = "no members yet",
}: {
  center: { label: string; sub?: string };
  nodes: RadialNode[];
  emptyLabel?: string;
}) {
  const W = 400;
  const H = 360;
  const cx = W / 2;
  const cy = H / 2;
  const R = Math.min(W, H) / 2 - 60;
  const n = nodes.length;
  const pos = (i: number) => {
    const a = (i / Math.max(n, 1)) * 2 * Math.PI - Math.PI / 2;
    return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) };
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="graph">
      {nodes.map((nd, i) => {
        const p = pos(i);
        return (
          <line
            key={`e-${nd.id}`}
            x1={cx}
            y1={cy}
            x2={p.x}
            y2={p.y}
            stroke={TONE[nd.tone]?.stroke ?? "#CBD5E1"}
            strokeWidth={1}
            strokeDasharray={nd.dashed ? "4 4" : undefined}
            opacity={0.45}
          />
        );
      })}
      {nodes.map((nd, i) => {
        const p = pos(i);
        const t = TONE[nd.tone] ?? TONE.open;
        return (
          <g key={nd.id}>
            <circle cx={p.x} cy={p.y} r={13} fill={t.fill} stroke={t.stroke} strokeWidth={2} strokeDasharray={nd.dashed ? "3 3" : undefined} />
            <text x={p.x} y={p.y + 28} textAnchor="middle" fontSize={9} fill="#475569" fontFamily="ui-monospace, monospace">
              {nd.label}
            </text>
            {nd.sub && (
              <text x={p.x} y={p.y + 39} textAnchor="middle" fontSize={8} fill="#94A3B8">
                {nd.sub}
              </text>
            )}
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r={27} fill="#194383" />
      <text x={cx} y={cy - 1} textAnchor="middle" fontSize={10} fontWeight={700} fill="#ffffff">
        {center.label.length > 11 ? center.label.slice(0, 10) + "…" : center.label}
      </text>
      {center.sub && (
        <text x={cx} y={cy + 12} textAnchor="middle" fontSize={8} fill="#cdd9ee">
          {center.sub}
        </text>
      )}
      {n === 0 && (
        <text x={cx} y={cy + 56} textAnchor="middle" fontSize={11} fill="#94A3B8">
          {emptyLabel}
        </text>
      )}
    </svg>
  );
}
