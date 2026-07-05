// Velocity & circulation health — how actively coins change hands (circulating
// volume ÷ supply, per day), plus average transfers per active wallet and the
// peak-velocity day. Interactive line with crosshair tooltip.
import type { VelocitySummary } from "../../lib/circlesData";
import { fmt, pct } from "../../lib/format";
import { C } from "../../lib/chartTheme";
import { ChartCard, EmptyHint } from "../../components/ui";
import { TimeSeriesChart } from "../../components/charts/TimeSeriesChart";

export function VelocitySection({ vel }: { vel: VelocitySummary }) {
  const hasData = vel.points.some((p) => p.volume > 0);
  return (
    <ChartCard title="Velocity & circulation" subtitle="How actively coins change hands · volume ÷ supply per day">
      {!hasData ? (
        <EmptyHint>Not enough circulation yet to measure velocity.</EmptyHint>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Avg velocity" value={pct(vel.avgVelocity, 1)} hint="of supply / day" />
            <Stat label="Tx / wallet" value={fmt(vel.avgTxPerWallet, 1)} hint="on active days" />
            <Stat label="Peak day" value={vel.peak && vel.peak.velocity > 0 ? pct(vel.peak.velocity, 1) : "—"} hint={vel.peak?.label ?? ""} />
          </div>
          <TimeSeriesChart
            labels={vel.points.map((p) => p.label)}
            series={[{ key: "vel", label: "Velocity", color: C.navy, values: vel.points.map((p) => p.velocity * 100), area: true }]}
            valueFormat={(n) => `${fmt(n, 1)}%`}
            height={170}
          />
        </div>
      )}
    </ChartCard>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-[10px] border border-border bg-muted/40 p-2.5 text-center">
      <div className="text-lg font-semibold leading-none tracking-tight text-foreground tnum">{value}</div>
      <div className="mt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate text-[10px] text-muted-foreground/80">{hint}</div>
    </div>
  );
}
