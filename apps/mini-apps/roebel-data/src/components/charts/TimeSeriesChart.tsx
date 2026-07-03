// Interactive multi-series line / area chart (visx). Crosshair + nearest-point
// tooltip on hover or drag; touch-friendly for the Circles iframe. Optional
// dashed reference line (e.g. "collateral today"). Responsive via ParentSize.
import { useId } from "react";
import { ParentSize } from "@visx/responsive";
import { scaleLinear } from "@visx/scale";
import { LinePath, AreaClosed, Line } from "@visx/shape";
import { curveMonotoneX } from "@visx/curve";
import { LinearGradient } from "@visx/gradient";
import { useTooltip } from "@visx/tooltip";
import { localPoint } from "@visx/event";
import { C, AREA_FILL } from "../../lib/chartTheme";
import { fmtCompact } from "../../lib/format";
import { ChartTooltip, type TooltipRow } from "./ChartTooltip";

export interface TsSeries {
  key: string;
  label: string;
  color: string;
  values: number[];
  area?: boolean;
  dashed?: boolean;
}
export interface TsRefLine {
  value: number;
  label: string;
  color: string;
}

interface Props {
  labels: string[];
  series: TsSeries[];
  height?: number;
  valueFormat?: (n: number) => string;
  refLine?: TsRefLine;
  zeroBaseline?: boolean;
}

export function TimeSeriesChart({ height = 200, ...rest }: Props) {
  return (
    <div className="relative w-full" style={{ height }}>
      <ParentSize debounceTime={0}>
        {({ width }) => (width > 0 ? <Inner width={width} height={height} {...rest} /> : null)}
      </ParentSize>
    </div>
  );
}

function Inner({
  width,
  height,
  labels,
  series,
  valueFormat = (n) => fmtCompact(n),
  refLine,
  zeroBaseline = true,
}: Props & { width: number; height: number }) {
  const uid = useId().replace(/:/g, "");
  const m = { top: 12, right: 12, bottom: 22, left: 40 };
  const plotW = Math.max(1, width - m.left - m.right);
  const plotH = Math.max(1, height - m.top - m.bottom);
  const n = Math.max(1, ...series.map((s) => s.values.length));

  const allVals = series.flatMap((s) => s.values);
  if (refLine) allVals.push(refLine.value);
  let lo = Math.min(0, ...allVals);
  let hi = Math.max(1, ...allVals);
  if (!zeroBaseline) {
    const dataLo = Math.min(...series.flatMap((s) => s.values), refLine?.value ?? Infinity);
    const dataHi = Math.max(...series.flatMap((s) => s.values), refLine?.value ?? -Infinity);
    const pad = (dataHi - dataLo) * 0.12 || dataHi * 0.12 || 1;
    lo = Math.max(0, dataLo - pad);
    hi = dataHi + pad;
  }
  if (hi <= lo) hi = lo + 1;

  const xScale = scaleLinear<number>({ domain: [0, Math.max(1, n - 1)], range: [m.left, m.left + plotW] });
  const yScale = scaleLinear<number>({ domain: [lo, hi], range: [m.top + plotH, m.top] });

  const ticks = yScale.ticks(3);
  const idxs = Array.from({ length: n }, (_, i) => i);

  const { showTooltip, hideTooltip, tooltipData, tooltipLeft, tooltipTop, tooltipOpen } = useTooltip<number>();

  const onMove = (e: React.MouseEvent | React.TouchEvent) => {
    const p = localPoint(e);
    if (!p) return;
    let i = Math.round(xScale.invert(p.x));
    i = Math.max(0, Math.min(n - 1, i));
    showTooltip({ tooltipData: i, tooltipLeft: xScale(i), tooltipTop: m.top });
  };

  const hovered = tooltipOpen && tooltipData != null ? tooltipData : null;
  const rows: TooltipRow[] =
    hovered == null
      ? []
      : series.map((s) => ({ color: s.color, label: s.label, value: valueFormat(s.values[hovered] ?? 0), bold: true }));
  if (hovered != null && refLine) rows.push({ color: refLine.color, label: refLine.label, value: valueFormat(refLine.value) });

  return (
    <>
      <svg width={width} height={height} role="img">
        <defs>
          {series.map((s) => (
            <LinearGradient key={s.key} id={`ts-${uid}-${s.key}`} from={s.color} to={s.color} fromOpacity={AREA_FILL.top} toOpacity={AREA_FILL.bottom} x1="0" y1="0" x2="0" y2="1" />
          ))}
        </defs>

        {/* gridlines + y labels */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={m.left} y1={yScale(t)} x2={m.left + plotW} y2={yScale(t)} stroke={C.grid} strokeWidth={1} strokeDasharray="3 4" />
            <text x={m.left - 6} y={yScale(t)} dy="0.32em" textAnchor="end" fontSize={10} fill={C.axis} className="tabular-nums">
              {fmtCompact(t)}
            </text>
          </g>
        ))}

        {/* areas first, then lines */}
        {series.filter((s) => s.area).map((s) => (
          <AreaClosed<number>
            key={`a-${s.key}`}
            data={idxs}
            x={(i) => xScale(i)}
            y={(i) => yScale(s.values[i] ?? lo)}
            yScale={yScale}
            curve={curveMonotoneX}
            fill={`url(#ts-${uid}-${s.key})`}
            stroke="transparent"
          />
        ))}
        {series.map((s) => (
          <LinePath<number>
            key={`l-${s.key}`}
            data={idxs}
            x={(i) => xScale(i)}
            y={(i) => yScale(s.values[i] ?? lo)}
            curve={curveMonotoneX}
            stroke={s.color}
            strokeWidth={2.25}
            strokeDasharray={s.dashed ? "5 4" : undefined}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {/* reference line */}
        {refLine && (
          <g>
            <line x1={m.left} y1={yScale(refLine.value)} x2={m.left + plotW} y2={yScale(refLine.value)} stroke={refLine.color} strokeWidth={1.5} strokeDasharray="4 3" />
          </g>
        )}

        {/* x labels (first / mid / last) */}
        {[0, Math.floor((n - 1) / 2), n - 1]
          .filter((v, i, a) => a.indexOf(v) === i && v >= 0 && v < labels.length)
          .map((i) => (
            <text key={i} x={xScale(i)} y={height - 6} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} fontSize={10} fill={C.axis}>
              {labels[i]}
            </text>
          ))}

        {/* crosshair */}
        {hovered != null && (
          <g pointerEvents="none">
            <Line from={{ x: xScale(hovered), y: m.top }} to={{ x: xScale(hovered), y: m.top + plotH }} stroke={C.navyMid} strokeWidth={1} strokeDasharray="3 3" />
            {series.map((s) => (
              <circle key={s.key} cx={xScale(hovered)} cy={yScale(s.values[hovered] ?? lo)} r={3.5} fill={C.white} stroke={s.color} strokeWidth={2} />
            ))}
          </g>
        )}

        {/* pointer capture */}
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

      {hovered != null && (
        <ChartTooltip left={tooltipLeft ?? 0} top={tooltipTop ?? 0} title={labels[hovered]} rows={rows} />
      )}
    </>
  );
}
