// Flow feed — the most recent coin movements, filterable by type. Each row links
// to the on-chain transaction on the Circles explorer.
import { useState } from "react";
import { flowLabel, FLOW_COLOR, type Transfer, type FlowKind, type Profile } from "../../lib/circlesData";
import { explorerTx } from "../../lib/citizens";
import { fmt, shortAddr, timeAgo } from "../../lib/format";
import { ChartCard, EmptyHint } from "../../components/ui";
import { ArrowUpRight } from "../../components/icons";

const KINDS: (FlowKind | "all")[] = ["all", "mint", "reward", "spend", "transfer"];

export function FlowFeedSection({ transfers, profiles }: { transfers: Transfer[]; profiles: Map<string, Profile> }) {
  const [filter, setFilter] = useState<FlowKind | "all">("all");
  const filtered = transfers.filter((t) => filter === "all" || t.kind === filter).slice(0, 40);
  const nameOf = (addr: string) => profiles.get(addr.toLowerCase())?.name || shortAddr(addr);

  return (
    <ChartCard title="Flow feed" subtitle="Most recent coin movements">
      <div className="no-scrollbar mb-3 flex gap-1 overflow-x-auto">
        {KINDS.map((k) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition ${
              filter === k ? "bg-[#00498B] text-white" : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {k === "all" ? "All" : flowLabel(k as FlowKind)}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <EmptyHint>No flows of this type yet.</EmptyHint>
      ) : (
        <ul className="divide-y divide-border">
          {filtered.map((t, i) => (
            <li key={t.tx + i}>
              <a href={explorerTx(t.tx)} target="_blank" rel="noreferrer" className="flex items-center gap-3 py-2.5 transition hover:opacity-80">
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: FLOW_COLOR[t.kind] }} />
                  {flowLabel(t.kind)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] text-muted-foreground">
                    {nameOf(t.from)} → {nameOf(t.to)}
                  </div>
                  {t.time > 0 && <div className="text-[11px] text-muted-foreground/80">{timeAgo(t.time)}</div>}
                </div>
                <div className="flex items-center gap-1 text-right">
                  <span className="text-[13px] font-semibold tabular-nums text-foreground">{fmt(t.amount, 2)}</span>
                  <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </ChartCard>
  );
}
