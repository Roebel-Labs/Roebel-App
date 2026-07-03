// KPI strip — eight live economy metrics, each with a Δ% vs the previous equal
// window and a sparkline (or a backing bar). 2-up grid, mobile-first.
import type { Kpi } from "../../lib/circlesData";
import { fmt, fmtInt } from "../../lib/format";
import { C } from "../../lib/chartTheme";
import { Sparkline } from "../../components/charts";
import { TrendingUp, TrendingDown } from "../../components/icons";

function fmtValue(k: Kpi): string {
  if (k.format === "pct") return `${fmt(Math.min(999, k.value), 0)}%`;
  if (k.format === "int") return fmtInt(k.value);
  return fmt(k.value, 0);
}

function Delta({ pct }: { pct: number | null }) {
  if (pct == null || !isFinite(pct)) return null;
  const up = pct >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
      style={{ color: up ? C.navy : C.gray, backgroundColor: up ? C.navyPale : C.muted }}
    >
      <Icon className="h-3 w-3" />
      {Math.abs(pct) >= 1000 ? "999+" : Math.abs(pct).toFixed(0)}%
    </span>
  );
}

export function KpiStrip({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {kpis.map((k) => (
        <div key={k.key} className="overflow-hidden rounded-[10px] border border-border bg-card p-3 shadow-sm">
          <div className="flex items-start justify-between gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{k.label}</span>
            <Delta pct={k.deltaPct} />
          </div>
          <div className="mt-1 text-xl font-semibold leading-none tracking-tight text-foreground tnum">{fmtValue(k)}</div>
          <div className="mt-1 truncate text-[11px] text-muted-foreground">{k.sub}</div>
          {k.key === "backing" ? (
            <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full" style={{ width: `${Math.max(3, Math.min(100, k.value))}%`, backgroundColor: C.navy }} />
            </div>
          ) : k.spark.some((v) => v > 0) ? (
            <div className="mt-2 -mb-0.5">
              <Sparkline points={k.spark} color={C.navy} height={26} />
            </div>
          ) : (
            <div className="mt-2 h-[26px]" />
          )}
        </div>
      ))}
    </div>
  );
}
