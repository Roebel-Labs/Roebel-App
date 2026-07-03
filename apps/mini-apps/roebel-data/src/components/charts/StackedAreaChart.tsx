// Interactive stacked-area chart (visx AreaStack) for daily money flows. Tappable
// legend toggles each series on/off; crosshair tooltip lists every visible series
// plus the day total. Touch-friendly. Responsive via ParentSize.
import { useId, useState } from "react";
import { ParentSize } from "@visx/responsive";
import { scaleLinear } from "@visx/scale";
import { AreaStack, Line } from "@visx/shape";
import { curveMonotoneX } from "@visx/curve";
import { useTooltip } from "@visx/tooltip";
import { localPoint } from "@visx/event";
import { C } from "../../lib/chartTheme";
import { fmtCompact, fmt } from "../../lib/format";
import { ChartTooltip, type TooltipRow } from "./ChartTooltip";

export interface StackSeries {
  key: string;
  label: string;
  color: string;
}
interface Props {
  labels: string[];
  /** One row per x-point, each with a numeric value per series key. */
  data: Record<string, number>[];
  series: StackSeries[];
  height?: number;
}

export function StackedAreaChart({ height = 210, series, ...rest }: Props) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const toggle = (k: string) =>
    setHidden((h) => {
      const next = new Set(h);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });
  const visible = series.filter((s) => !hidden.has(s.key));

  return (
    <div>
      <div className="mb-2.5 flex flex-wrap gap-1.5">
        {series.map((s) => {
          const off = hidden.has(s.key);
          return (
            <button
              key={s.key}
              onClick={() => toggle(s.key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium transition ${
                off ? "border-border bg-card text-muted-foreground/60" : "border-border bg-muted text-foreground"
              }`}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: off ? C.grayLt : s.color }} />
              {s.label}
            </button>
          );
        })}
      </div>
      <div className="relative w-full" style={{ height }}>
        <ParentSize debounceTime={0}>
          {({ width }) => (width > 0 ? <Inner width={width} height={height} series={series} visible={visible} {...rest} /> : null)}
        </ParentSize>
      </div>
    </div>
  );
}

type Datum = { i: number } & Record<string, number>;

function Inner({
  width,
  height,
  labels,
  data,
  series,
  visible,
}: Props & { width: number; height: number; visible: StackSeries[] }) {
  const uid = useId().replace(/:/g, "");
  const m = { top: 12, right: 12, bottom: 22, left: 40 };
  const plotW = Math.max(1, width - m.left - m.right);
  const plotH = Math.max(1, height - m.top - m.bottom);
  const n = Math.max(1, data.length);
  const keys = visible.map((s) => s.key);
  const colorOf = (k: string) => series.find((s) => s.key === k)?.color ?? C.navy;
  const labelOf = (k: string) => series.find((s) => s.key === k)?.label ?? k;

  const rows: Datum[] = data.map((d, i) => ({ i, ...(d as Record<string, number>) })) as Datum[];
  const totals = rows.map((r) => keys.reduce((a, k) => a + (r[k] ?? 0), 0));
  const yMax = Math.max(1, ...totals);

  const xScale = scaleLinear<number>({ domain: [0, Math.max(1, n - 1)], range: [m.left, m.left + plotW] });
  const yScale = scaleLinear<number>({ domain: [0, yMax], range: [m.top + plotH, m.top] });
  const ticks = yScale.ticks(3);

  const { showTooltip, hideTooltip, tooltipData, tooltipLeft, tooltipOpen } = useTooltip<number>();
  const onMove = (e: React.MouseEvent | React.TouchEvent) => {
    const p = localPoint(e);
    if (!p) return;
    let i = Math.round(xScale.invert(p.x));
    i = Math.max(0, Math.min(n - 1, i));
    showTooltip({ tooltipData: i, tooltipLeft: xScale(i), tooltipTop: m.top });
  };
  const hovered = tooltipOpen && tooltipData != null ? tooltipData : null;

  const tipRows: TooltipRow[] =
    hovered == null
      ? []
      : [
          ...visible.map((s) => ({ color: s.color, label: s.label, value: fmt(rows[hovered]?.[s.key] ?? 0, 0) })),
          { label: "Total", value: fmt(totals[hovered] ?? 0, 0), bold: true },
        ];

  return (
    <>
      <svg width={width} height={height} role="img">
        <defs>
          {visible.map((s) => (
            <linearGradient key={s.key} id={`sa-${uid}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.55} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0.18} />
            </linearGradient>
          ))}
        </defs>

        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={m.left} y1={yScale(t)} x2={m.left + plotW} y2={yScale(t)} stroke={C.grid} strokeWidth={1} strokeDasharray="3 4" />
            <text x={m.left - 6} y={yScale(t)} dy="0.32em" textAnchor="end" fontSize={10} fill={C.axis} className="tabular-nums">
              {fmtCompact(t)}
            </text>
          </g>
        ))}

        {keys.length > 0 && (
          <AreaStack<Datum>
            keys={keys}
            data={rows}
            x={(d) => xScale(d.data.i)}
            y0={(d) => yScale(d[0])}
            y1={(d) => yScale(d[1])}
            curve={curveMonotoneX}
          >
            {({ stacks, path }) =>
              stacks.map((stack) => (
                <path key={stack.key} d={path(stack) || ""} fill={`url(#sa-${uid}-${stack.key})`} stroke={colorOf(String(stack.key))} strokeWidth={1.25} />
              ))
            }
          </AreaStack>
        )}

        {[0, Math.floor((n - 1) / 2), n - 1]
          .filter((v, i, a) => a.indexOf(v) === i && v >= 0 && v < labels.length)
          .map((i) => (
            <text key={i} x={xScale(i)} y={height - 6} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} fontSize={10} fill={C.axis}>
              {labels[i]}
            </text>
          ))}

        {hovered != null && (
          <Line from={{ x: xScale(hovered), y: m.top }} to={{ x: xScale(hovered), y: m.top + plotH }} stroke={C.navyMid} strokeWidth={1} strokeDasharray="3 3" pointerEvents="none" />
        )}

        <rect
          x={m.left}
          y={m.top}
          width={plotW}
          height={plotH}
          fill="transparent"
          onMouseMove={onMove}
          onMouseLeave={hideTooltip}
          onTouchStart={onMove}
          onTouchMove={onMove}
          onTouchEnd={hideTooltip}
        />
      </svg>

      {hovered != null && <ChartTooltip left={tooltipLeft ?? 0} top={m.top} title={labels[hovered]} rows={tipRows} />}
    </>
  );
}
