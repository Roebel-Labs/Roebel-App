// Supply & backing — interactive cumulative-supply area with a "collateral today"
// reference line, plus a backing gauge. Supply is anchored to the live demurraged
// total and reconstructed backward from mint/burn flows.
import type { SupplyPoint } from "../../lib/circlesData";
import { fmt, pct } from "../../lib/format";
import { C } from "../../lib/chartTheme";
import { ChartCard, EmptyHint } from "../../components/ui";
import { Donut } from "../../components/charts";
import { TimeSeriesChart } from "../../components/charts/TimeSeriesChart";

export function SupplyBackingSection({ series, supply, collateral }: { series: SupplyPoint[]; supply: number; collateral: number }) {
  const backing = supply > 0 ? collateral / supply : 0;
  const empty = supply <= 0 && series.every((p) => p.supply <= 0);
  return (
    <ChartCard title="Umlauf & Deckung" subtitle="Röbel-Münzen im Umlauf vs. hinterlegte Deckung 1:1">
      {empty ? (
        <EmptyHint>Noch keine Münzen ausgegeben — lade Bürger:innen ein, um die ersten Röbel-Münzen zu erhalten.</EmptyHint>
      ) : (
        <div className="space-y-4">
          <TimeSeriesChart
            labels={series.map((p) => p.label)}
            series={[{ key: "supply", label: "Umlauf", color: C.navy, values: series.map((p) => p.supply), area: true }]}
            refLine={collateral > 0 ? { value: collateral, label: "Deckung heute", color: C.gold } : undefined}
            zeroBaseline={false}
            height={190}
          />
          <div className="flex items-center gap-4 border-t border-border/70 pt-3">
            <Donut value={backing} label={backing >= 1 ? "100%" : pct(backing, 0)} sub="gedeckt" color={C.navy} size={104} />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Row label="Im Umlauf" value={`${fmt(supply, 0)}`} dot={C.navy} />
              <Row label="Hinterlegte Deckung" value={`${fmt(collateral, 0)}`} dot={C.gold} />
              <p className="pt-1 text-[11px] leading-relaxed text-muted-foreground">
                {backing >= 0.999
                  ? "Jede Münze ist voll 1:1 gedeckt."
                  : "Jede Münze ist durch hinterlegte Deckung abgesichert."}
              </p>
            </div>
          </div>
        </div>
      )}
    </ChartCard>
  );
}

function Row({ label, value, dot }: { label: string; value: string; dot: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: dot }} />
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className="ml-auto text-[13px] font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}
