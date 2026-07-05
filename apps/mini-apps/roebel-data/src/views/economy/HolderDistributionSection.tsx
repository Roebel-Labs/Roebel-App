// Holder distribution — how Röbel Coins are spread across wallets. A balance
// histogram, plus a Lorenz curve with the Gini coefficient and the top-holder
// concentration share. The economist's view of the town's wealth equality.
import { holderDistribution, type Holder } from "../../lib/circlesData";
import { fmt, pct } from "../../lib/format";
import { ChartCard, EmptyHint } from "../../components/ui";
import { Histogram } from "../../components/charts/Histogram";
import { LorenzCurve } from "../../components/charts/LorenzCurve";

export function HolderDistributionSection({ holders }: { holders: Holder[] }) {
  const dist = holderDistribution(holders);

  return (
    <ChartCard title="Verteilung" subtitle="Wie gleichmäßig die Röbel-Münzen verteilt sind">
      {dist.holderCount === 0 ? (
        <EmptyHint>Noch keine Halter:innen mit Guthaben.</EmptyHint>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Gini" value={dist.gini.toFixed(2)} hint={dist.gini < 0.4 ? "recht gleichmäßig" : dist.gini < 0.6 ? "mittel" : "konzentriert"} />
            <Stat label={`Top ${dist.topShare.n} halten`} value={pct(dist.topShare.share, 0)} hint={`von ${dist.holderCount} Halter:innen`} />
            <Stat label="Median" value={fmt(dist.median, 0)} hint="Münzen" />
          </div>

          <div>
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Halter:innen pro Guthaben-Stufe</div>
            <Histogram bars={dist.buckets.map((b) => ({ label: b.label, count: b.count, color: b.color }))} height={170} />
          </div>

          <div className="border-t border-border/70 pt-3">
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Konzentration (Lorenz-Kurve)</div>
            <LorenzCurve points={dist.lorenz} gini={dist.gini} height={200} />
            <p className="mt-1 text-center text-[11px] text-muted-foreground">
              Goldene Linie = perfekte Gleichheit · Navy-Linie = tatsächlich · die Lücke ist die Ungleichheit.
            </p>
          </div>
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
