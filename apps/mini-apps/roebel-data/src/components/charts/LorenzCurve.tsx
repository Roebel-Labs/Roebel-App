// Lorenz curve (visx) — wealth concentration of Röbel Coin holders. The gold
// dashed diagonal is perfect equality; the navy curve is the real distribution;
// the shaded gap is inequality (≈ Gini). Hover to read "bottom X% hold Y%".
import { ParentSize } from "@visx/responsive";
import { scaleLinear } from "@visx/scale";
import { Line } from "@visx/shape";
import { useTooltip } from "@visx/tooltip";
import { localPoint } from "@visx/event";
import { C } from "../../lib/chartTheme";
import { pct } from "../../lib/format";
import { ChartTooltip } from "./ChartTooltip";

interface Props {
  points: { x: number; y: number }[];
  gini: number;
  height?: number;
}

export function LorenzCurve({ height = 200, ...rest }: Props) {
  return (
    <div className="relative w-full" style={{ height }}>
      <ParentSize debounceTime={0}>{({ width }) => (width > 0 ? <Inner width={width} height={height} {...rest} /> : null)}</ParentSize>
    </div>
  );
}

function Inner({ width, height, points, gini }: Props & { width: number; height: number }) {
  const m = { top: 10, right: 10, bottom: 22, left: 30 };
  const size = Math.max(1, Math.min(width - m.left - m.right, height - m.top - m.bottom));
  const ox = m.left + (width - m.left - m.right - size) / 2;
  const oy = m.top;
  const xs = scaleLinear<number>({ domain: [0, 1], range: [ox, ox + size] });
  const ys = scaleLinear<number>({ domain: [0, 1], range: [oy + size, oy] });

  const curve = points.length ? points : [{ x: 0, y: 0 }, { x: 1, y: 1 }];
  const line = curve.map((p, i) => `${i === 0 ? "M" : "L"} ${xs(p.x).toFixed(1)} ${ys(p.y).toFixed(1)}`).join(" ");
  // gap polygon: diagonal (equality) out, Lorenz curve back
  const gap = `M ${xs(0)} ${ys(0)} L ${xs(1)} ${ys(1)} ${[...curve].reverse().map((p) => `L ${xs(p.x).toFixed(1)} ${ys(p.y).toFixed(1)}`).join(" ")} Z`;

  const { showTooltip, hideTooltip, tooltipData, tooltipLeft, tooltipTop, tooltipOpen } = useTooltip<{ x: number; y: number }>();
  const onMove = (e: React.MouseEvent | React.TouchEvent) => {
    const p = localPoint(e);
    if (!p) return;
    const fx = Math.max(0, Math.min(1, xs.invert(p.x)));
    // nearest curve point by population share
    let best = curve[0];
    for (const c of curve) if (Math.abs(c.x - fx) < Math.abs(best.x - fx)) best = c;
    showTooltip({ tooltipData: best, tooltipLeft: xs(best.x), tooltipTop: ys(best.y) });
  };
  const hovered = tooltipOpen ? tooltipData ?? null : null;

  return (
    <>
      <svg width={width} height={height} role="img">
        {/* frame */}
        <rect x={ox} y={oy} width={size} height={size} fill="none" stroke={C.grid} strokeWidth={1} />
        {/* inequality gap */}
        <path d={gap} fill={C.navyPale} stroke="none" />
        {/* equality diagonal */}
        <line x1={xs(0)} y1={ys(0)} x2={xs(1)} y2={ys(1)} stroke={C.gold} strokeWidth={1.5} strokeDasharray="5 4" />
        {/* Lorenz curve */}
        <path d={line} fill="none" stroke={C.navy} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />

        {/* axis labels */}
        <text x={ox} y={height - 6} textAnchor="start" fontSize={10} fill={C.axis}>0%</text>
        <text x={ox + size} y={height - 6} textAnchor="end" fontSize={10} fill={C.axis}>100% holders</text>
        <text x={ox - 6} y={ys(1)} dy="0.7em" textAnchor="end" fontSize={10} fill={C.axis}>100%</text>
        <text x={ox - 6} y={ys(0)} dy="-0.2em" textAnchor="end" fontSize={10} fill={C.axis}>0%</text>

        {hovered && (
          <g pointerEvents="none">
            <Line from={{ x: xs(hovered.x), y: oy }} to={{ x: xs(hovered.x), y: oy + size }} stroke={C.navyMid} strokeWidth={1} strokeDasharray="3 3" />
            <circle cx={xs(hovered.x)} cy={ys(hovered.y)} r={3.5} fill={C.white} stroke={C.navy} strokeWidth={2} />
          </g>
        )}

        <rect x={ox} y={oy} width={size} height={size} fill="transparent" onMouseMove={onMove} onMouseLeave={hideTooltip} onTouchStart={onMove} onTouchMove={onMove} onTouchEnd={hideTooltip} />
      </svg>
      {hovered && (
        <ChartTooltip
          left={tooltipLeft ?? 0}
          top={tooltipTop ?? 0}
          rows={[
            { label: `bottom ${pct(hovered.x, 0)}`, value: `hold ${pct(hovered.y, 0)}`, bold: true },
            { color: C.gold, label: "Gini", value: gini.toFixed(2) },
          ]}
        />
      )}
    </>
  );
}
