// Money flows — interactive stacked area of daily mint / reward / spend / transfer.
// Legend chips toggle series; crosshair tooltip lists every kind + the day total.
// A small treasury loop stat summarises earn vs spend over the window.
import { flowLabel, FLOW_COLOR, type DayBucket, type FlowKind } from "../../lib/circlesData";
import { fmt } from "../../lib/format";
import { ChartCard, EmptyHint } from "../../components/ui";
import { StackedAreaChart, type StackSeries } from "../../components/charts/StackedAreaChart";
import { ArrowUpRight, ArrowDownLeft } from "../../components/icons";
import { C } from "../../lib/chartTheme";

const KEYS: FlowKind[] = ["mint", "reward", "spend", "transfer"];
const SERIES: StackSeries[] = KEYS.map((k) => ({ key: k, label: flowLabel(k), color: FLOW_COLOR[k] }));

export function MoneyFlowsSection({ buckets }: { buckets: DayBucket[] }) {
  const total = buckets.reduce((a, b) => a + b.total, 0);
  const earned = buckets.reduce((a, b) => a + b.reward, 0);
  const spent = buckets.reduce((a, b) => a + b.spend, 0);

  return (
    <ChartCard title="Geldflüsse" subtitle="Täglich · tippe zum Ein-/Ausblenden">
      {total <= 0 ? (
        <EmptyHint>In diesem Zeitraum noch keine Bewegungen.</EmptyHint>
      ) : (
        <div className="space-y-3">
          <StackedAreaChart
            labels={buckets.map((b) => b.label)}
            data={buckets.map((b) => ({ mint: b.mint, reward: b.reward, spend: b.spend, transfer: b.transfer }))}
            series={SERIES}
            height={210}
          />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/70 pt-3 text-[12px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-flex" style={{ color: C.sky }}>
                <ArrowDownLeft className="h-3.5 w-3.5" />
              </span>
              Kasse erhalten <span className="font-semibold tabular-nums text-foreground">{fmt(earned, 0)}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-flex" style={{ color: C.gold }}>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </span>
              ausgegeben <span className="font-semibold tabular-nums text-foreground">{fmt(spent, 0)}</span>
            </span>
          </div>
        </div>
      )}
    </ChartCard>
  );
}
