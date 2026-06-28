// Interactive histogram (visx) for the holder-balance distribution. Hover / tap a
// bar to highlight it and show its count + share of holders. Responsive.
import { ParentSize } from "@visx/responsive";
import { scaleBand, scaleLinear } from "@visx/scale";
import { useTooltip } from "@visx/tooltip";
import { localPoint } from "@visx/event";
import { C } from "../../lib/chartTheme";
import { pct } from "../../lib/format";
import { ChartTooltip } from "./ChartTooltip";

export interface Bar {
  label: string;
  count: number;
  color?: string;
}
interface Props {
  bars: Bar[];
  height?: number;
  unit?: string; // tooltip noun, e.g. "holders"
}

export function Histogram({ height = 180, ...rest }: Props) {
  return (
    <div className="relative w-full" style={{ height }}>
      <ParentSize debounceTime={0}>{({ width }) => (width > 0 ? <Inner width={width} height={height} {...rest} /> : null)}</ParentSize>
    </div>
  );
}

function Inner({ width, height, bars, unit = "holders" }: Props & { width: number; height: number }) {
  const m = { top: 18, right: 8, bottom: 28, left: 8 };
  const plotW = Math.max(1, width - m.left - m.right);
  const plotH = Math.max(1, height - m.top - m.bottom);
  const total = bars.reduce((a, b) => a + b.count, 0) || 1;
  const max = Math.max(1, ...bars.map((b) => b.count));

  const x = scaleBand<string>({ domain: bars.map((b) => b.label), range: [m.left, m.left + plotW], padding: 0.32 });
  const y = scaleLinear<number>({ domain: [0, max], range: [m.top + plotH, m.top] });
  const bw = x.bandwidth();

  const { showTooltip, hideTooltip, tooltipData, tooltipLeft, tooltipTop, tooltipOpen } = useTooltip<number>();
  const hovered = tooltipOpen && tooltipData != null ? tooltipData : null;

  const enter = (e: React.MouseEvent | React.TouchEvent, i: number) => {
    const p = localPoint(e);
    showTooltip({ tooltipData: i, tooltipLeft: (x(bars[i].label) ?? 0) + bw / 2, tooltipTop: p?.y ?? m.top });
  };

  return (
    <>
      <svg width={width} height={height} role="img">
        <line x1={m.left} y1={m.top + plotH} x2={m.left + plotW} y2={m.top + plotH} stroke={C.grid} strokeWidth={1} />
        {bars.map((b, i) => {
          const bx = x(b.label) ?? 0;
          const bh = Math.max(b.count > 0 ? 3 : 0, (b.count / max) * plotH);
          const by = m.top + plotH - bh;
          const active = hovered === i;
          const r = Math.min(6, bw / 2);
          return (
            <g key={b.label} onMouseEnter={(e) => enter(e, i)} onMouseMove={(e) => enter(e, i)} onMouseLeave={hideTooltip} onTouchStart={(e) => enter(e, i)}>
              {bh > 0 && (
                <path
                  d={`M ${bx} ${by + r} a ${r} ${r} 0 0 1 ${r} ${-r} h ${bw - 2 * r} a ${r} ${r} 0 0 1 ${r} ${r} v ${bh - r} h ${-bw} Z`}
                  fill={active ? C.gold : b.color ?? C.navy}
                  style={{ transition: "fill 120ms" }}
                />
              )}
              <text x={bx + bw / 2} y={by - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill={active ? C.ink : C.gray} className="tabular-nums">
                {b.count}
              </text>
              <text x={bx + bw / 2} y={height - 9} textAnchor="middle" fontSize={10} fill={C.axis}>
                {b.label}
              </text>
              {/* invisible hit area so empty buckets are still hoverable */}
              <rect x={bx} y={m.top} width={bw} height={plotH} fill="transparent" />
            </g>
          );
        })}
      </svg>
      {hovered != null && (
        <ChartTooltip
          left={tooltipLeft ?? 0}
          top={tooltipTop ?? 0}
          title={`${bars[hovered].label} coins`}
          rows={[
            { color: C.navy, label: unit, value: String(bars[hovered].count) },
            { label: "share", value: pct(bars[hovered].count / total, 0), bold: true },
          ]}
        />
      )}
    </>
  );
}
