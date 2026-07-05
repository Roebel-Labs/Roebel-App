// Flow composition — range-aware split of where coins move, by type. Interactive:
// hover / tap a segment or legend row to highlight it across both.
import { summarizeFlows, type Transfer } from "../../lib/circlesData";
import { ChartCard, EmptyHint } from "../../components/ui";
import { InteractiveSplitBar, type SplitPart } from "../../components/charts/InteractiveSplitBar";

export function FlowCompositionSection({ transfers }: { transfers: Transfer[] }) {
  const summary = summarizeFlows(transfers);
  const parts: SplitPart[] = summary.byKind
    .filter((b) => b.amount > 0 || b.count > 0)
    .map((b) => ({ key: b.kind, label: b.label, value: b.amount, count: b.count, color: b.color }));

  return (
    <ChartCard title="Zusammensetzung" subtitle="Wohin die Münzen fließen · dieser Zeitraum">
      {summary.totalAmount <= 0 ? <EmptyHint>In diesem Zeitraum noch keine Bewegungen.</EmptyHint> : <InteractiveSplitBar parts={parts} />}
    </ChartCard>
  );
}
