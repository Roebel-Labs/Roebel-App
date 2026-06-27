// Dependency-free SVG charts in the Röbel admin-dashboard idiom: gradient area charts,
// rounded bar charts, a donut gauge and a split bar. Crisp at any width (viewBox + h-auto).
import { useId } from "react";

const AXIS = "#a3a3a3"; // neutral-400
const GRID = "#e5e5e5"; // neutral-200

/* ── Area chart (one or two series, gradient fill) ─────────────────────────── */
export interface AreaSeries {
  color: string;
  points: number[];
}
export function AreaChart({
  series,
  labels = [],
  height = 200,
  yMax,
}: {
  series: AreaSeries[];
  labels?: string[];
  height?: number;
  yMax?: number;
}) {
  const uid = useId().replace(/:/g, "");
  const W = 600;
  const H = height;
  const padL = 8;
  const padR = 8;
  const padT = 12;
  const padB = 22;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = Math.max(1, ...series.map((s) => s.points.length));
  const max = Math.max(yMax ?? 0, 1, ...series.flatMap((s) => s.points));
  const x = (i: number) => padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => padT + plotH - (Math.max(0, v) / max) * plotH;

  const grid = [0, 0.5, 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="h-auto w-full" role="img">
      <defs>
        {series.map((s, si) => (
          <linearGradient key={si} id={`area-${uid}-${si}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={s.color} stopOpacity={0.34} />
            <stop offset="100%" stopColor={s.color} stopOpacity={0.03} />
          </linearGradient>
        ))}
      </defs>

      {grid.map((g, i) => {
        const gy = padT + plotH - g * plotH;
        return <line key={i} x1={padL} y1={gy} x2={W - padR} y2={gy} stroke={GRID} strokeWidth={1} strokeDasharray="3 4" />;
      })}

      {series.map((s, si) => {
        if (!s.points.length) return null;
        const line = s.points.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
        const area = `${line} L ${x(s.points.length - 1).toFixed(1)} ${padT + plotH} L ${x(0).toFixed(1)} ${padT + plotH} Z`;
        return (
          <g key={si}>
            <path d={area} fill={`url(#area-${uid}-${si})`} />
            <path d={line} fill="none" stroke={s.color} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />
            {s.points.map((v, i) =>
              i === s.points.length - 1 ? <circle key={i} cx={x(i)} cy={y(v)} r={3} fill={s.color} /> : null,
            )}
          </g>
        );
      })}

      {labels.length > 0 &&
        [0, Math.floor((labels.length - 1) / 2), labels.length - 1]
          .filter((v, i, a) => a.indexOf(v) === i)
          .map((idx) => (
            <text key={idx} x={x(idx)} y={H - 6} textAnchor={idx === 0 ? "start" : idx === labels.length - 1 ? "end" : "middle"} fontSize={11} fill={AXIS}>
              {labels[idx]}
            </text>
          ))}
    </svg>
  );
}

/* ── Bar chart (rounded tops, per-bar color) ───────────────────────────────── */
export function BarChart({
  data,
  height = 200,
}: {
  data: { label: string; value: number; color: string }[];
  height?: number;
}) {
  const W = 600;
  const H = height;
  const padT = 16;
  const padB = 26;
  const plotH = H - padT - padB;
  const max = Math.max(1, ...data.map((d) => d.value));
  const n = Math.max(1, data.length);
  const slot = W / n;
  const bw = Math.min(64, slot * 0.56);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="h-auto w-full" role="img">
      {[0, 0.5, 1].map((g, i) => {
        const gy = padT + plotH - g * plotH;
        return <line key={i} x1={0} y1={gy} x2={W} y2={gy} stroke={GRID} strokeWidth={1} strokeDasharray="3 4" />;
      })}
      {data.map((d, i) => {
        const cx = slot * i + slot / 2;
        const bh = Math.max(2, (d.value / max) * plotH);
        const yTop = padT + plotH - bh;
        const r = Math.min(6, bw / 2);
        return (
          <g key={d.label}>
            <path
              d={`M ${cx - bw / 2} ${yTop + r}
                  a ${r} ${r} 0 0 1 ${r} ${-r}
                  h ${bw - 2 * r}
                  a ${r} ${r} 0 0 1 ${r} ${r}
                  v ${bh - r}
                  h ${-bw}
                  Z`}
              fill={d.color}
            />
            <text x={cx} y={yTop - 5} textAnchor="middle" fontSize={11} fontWeight={600} fill="#525252">
              {d.value >= 1000 ? `${(d.value / 1000).toFixed(1)}k` : Math.round(d.value)}
            </text>
            <text x={cx} y={H - 8} textAnchor="middle" fontSize={11} fill={AXIS}>
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ── Donut gauge (ratio) ───────────────────────────────────────────────────── */
export function Donut({
  value,
  color = "#00498B",
  track = "#e5e5e5",
  label,
  sub,
  size = 132,
}: {
  value: number; // 0..1 (clamped visually to 1)
  color?: string;
  track?: string; // neutral-200 by default
  label?: string;
  sub?: string;
  size?: number;
}) {
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {label && <span className="text-xl font-semibold tracking-tight text-foreground tnum">{label}</span>}
        {sub && <span className="mt-0.5 text-[11px] text-muted-foreground">{sub}</span>}
      </div>
    </div>
  );
}

/* ── Split bar (stacked proportions) ───────────────────────────────────────── */
export function SplitBar({ parts }: { parts: { value: number; color: string }[] }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  return (
    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
      {parts.map((p, i) => (
        <div key={i} style={{ width: `${(p.value / total) * 100}%`, backgroundColor: p.color }} className="h-full" />
      ))}
    </div>
  );
}

/* ── Sparkline ─────────────────────────────────────────────────────────────── */
export function Sparkline({ points, color = "#00498B", height = 36 }: { points: number[]; color?: string; height?: number }) {
  const W = 120;
  const H = height;
  const max = Math.max(1, ...points);
  const n = Math.max(1, points.length);
  const x = (i: number) => (n <= 1 ? W / 2 : (i / (n - 1)) * W);
  const y = (v: number) => H - 3 - (v / max) * (H - 6);
  const line = points.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-auto w-full" role="img">
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
