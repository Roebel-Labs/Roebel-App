// Dependency-free SVG radial graph: a glowing center node with leaf nodes on a ring and
// edges from center to each. Used for the town trust graph and the network-of-towns map
// (small node counts → a clean radial layout beats a heavy force-graph library).

export interface RadialNode {
  id: string;
  label: string;
  sub?: string;
  tone: "verified" | "attester" | "open" | "real" | "placeholder";
  dashed?: boolean;
}

// Monochrome: navy (and a lighter navy fill) for nodes that are part of the
// group; neutral gray for nodes that aren't yet. No other hues.
const TONE: Record<string, { fill: string; stroke: string; glow?: string }> = {
  verified: { fill: "#E8EEF7", stroke: "#194383", glow: "rgba(25,67,131,0.28)" }, // navy outline
  attester: { fill: "#194383", stroke: "#194383", glow: "rgba(25,67,131,0.32)" }, // solid navy
  open: { fill: "#F5F5F5", stroke: "#A3A3A3" }, // neutral
  real: { fill: "#194383", stroke: "#194383", glow: "rgba(25,67,131,0.32)" }, // solid navy
  placeholder: { fill: "#FAFAFA", stroke: "#D4D4D4" }, // neutral
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
  const H = 372;
  const cx = W / 2;
  const cy = H / 2;
  const R = Math.min(W, H) / 2 - 64;
  const n = nodes.length;
  const pos = (i: number) => {
    const a = (i / Math.max(n, 1)) * 2 * Math.PI - Math.PI / 2;
    return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) };
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="graph">
      <defs>
        <radialGradient id="rg-center" cx="50%" cy="38%" r="70%">
          <stop offset="0%" stopColor="#2b5aa8" />
          <stop offset="100%" stopColor="#194383" />
        </radialGradient>
        <filter id="rg-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* faint concentric rings for depth */}
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="#ededed" strokeWidth={1} />
      <circle cx={cx} cy={cy} r={R * 0.62} fill="none" stroke="#f5f5f5" strokeWidth={1} />

      {/* edges */}
      {nodes.map((nd, i) => {
        const p = pos(i);
        const len = Math.hypot(p.x - cx, p.y - cy);
        return (
          <line
            key={`e-${nd.id}`}
            x1={cx}
            y1={cy}
            x2={p.x}
            y2={p.y}
            stroke={TONE[nd.tone]?.stroke ?? "#D4D4D4"}
            strokeWidth={1.25}
            strokeDasharray={nd.dashed ? "4 4" : `${len}`}
            strokeDashoffset={nd.dashed ? undefined : 0}
            className={nd.dashed ? undefined : "rc-draw"}
            style={nd.dashed ? { opacity: 0.5 } : ({ ["--rc-len" as string]: `${len}`, animation: `rc-draw 0.9s ${0.15 + i * 0.03}s ease-out both`, opacity: 0.55 } as React.CSSProperties)}
          />
        );
      })}

      {/* leaf nodes */}
      {nodes.map((nd, i) => {
        const p = pos(i);
        const t = TONE[nd.tone] ?? TONE.open;
        return (
          <g key={nd.id} className="rc-rise" style={{ animationDelay: `${0.2 + i * 0.03}s` }}>
            {t.glow && <circle cx={p.x} cy={p.y} r={13} fill={t.glow} filter="url(#rg-glow)" opacity={0.7} />}
            <circle
              cx={p.x}
              cy={p.y}
              r={13}
              fill={t.fill}
              stroke={t.stroke}
              strokeWidth={2}
              strokeDasharray={nd.dashed ? "3 3" : undefined}
            />
            <text x={p.x} y={p.y + 28} textAnchor="middle" fontSize={9.5} fill="#525252" fontFamily="ui-monospace, monospace">
              {nd.label}
            </text>
            {nd.sub && (
              <text x={p.x} y={p.y + 39} textAnchor="middle" fontSize={8} fill="#A3A3A3">
                {nd.sub}
              </text>
            )}
          </g>
        );
      })}

      {/* center */}
      <circle cx={cx} cy={cy} r={32} fill="url(#rg-center)" filter="url(#rg-glow)" />
      <circle cx={cx} cy={cy} r={32} fill="none" stroke="#ffffff" strokeOpacity={0.25} strokeWidth={1.5} />
      <text x={cx} y={cy - 2} textAnchor="middle" fontSize={11} fontWeight={700} fill="#ffffff">
        {center.label.length > 12 ? center.label.slice(0, 11) + "…" : center.label}
      </text>
      {center.sub && (
        <text x={cx} y={cy + 12} textAnchor="middle" fontSize={8.5} fill="#cdd9ee">
          {center.sub}
        </text>
      )}
      {n === 0 && (
        <text x={cx} y={cy + 58} textAnchor="middle" fontSize={11} fill="#A3A3A3">
          {emptyLabel}
        </text>
      )}
    </svg>
  );
}
