// Reputation leaderboard — coins held + flow activity. Navy badge = verified
// citizen. Tap a row to expand its score breakdown (held / received / sent),
// the exact weights behind the rank.
import { useState } from "react";
import type { RepNode, Profile } from "../../lib/circlesData";
import { fmt, shortAddr } from "../../lib/format";
import { C } from "../../lib/chartTheme";
import { ChartCard, EmptyHint, Avatar } from "../../components/ui";
import { ChevronRight, ArrowUpRight } from "../../components/icons";
import { explorerAvatar } from "../../lib/citizens";

export function ReputationSection({ rep, profiles }: { rep: RepNode[]; profiles: Map<string, Profile> }) {
  const [open, setOpen] = useState<string | null>(null);
  const maxScore = Math.max(1, ...rep.map((r) => r.score));
  const top = rep.slice(0, 12);

  return (
    <ChartCard title="Reputation" subtitle="Coins held + flow activity · navy = verified citizen · tap for breakdown">
      {rep.length === 0 ? (
        <EmptyHint>No reputation data yet.</EmptyHint>
      ) : (
        <ol className="space-y-1">
          {top.map((n, i) => {
            const p = profiles.get(n.address.toLowerCase());
            const isOpen = open === n.address;
            return (
              <li key={n.address} className="rounded-[10px] transition-colors">
                <button
                  onClick={() => setOpen((o) => (o === n.address ? null : n.address))}
                  className={`flex w-full items-center gap-2.5 rounded-[10px] px-1.5 py-1.5 text-left transition ${isOpen ? "bg-muted" : "hover:bg-muted/60"}`}
                >
                  <span className="w-4 shrink-0 text-right text-[11px] font-semibold tabular-nums text-muted-foreground">{i + 1}</span>
                  <span className="relative shrink-0">
                    <Avatar address={n.address} name={p?.name ?? null} imageUrl={p?.imageUrl ?? null} size={28} />
                    <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card ${n.verified ? "bg-[#00498B]" : "bg-neutral-300"}`} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium leading-tight text-foreground">{p?.name || shortAddr(n.address)}</span>
                    <span className="block text-[11px] tabular-nums text-muted-foreground">
                      {fmt(n.held, 0)} coins · {n.inCount}↓ {n.outCount}↑
                    </span>
                  </span>
                  <ChevronRight className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`} />
                </button>
                <div className="mb-1 ml-[26px] mr-1.5 mt-0.5 h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-[#00498B]" style={{ width: `${Math.max(3, (n.score / maxScore) * 100)}%` }} />
                </div>
                {isOpen && <Breakdown node={n} />}
              </li>
            );
          })}
        </ol>
      )}
    </ChartCard>
  );
}

function Breakdown({ node }: { node: RepNode }) {
  const held = node.held;
  const recv = node.inCount * 0.5;
  const sent = node.outCount * 0.25;
  const total = held + recv + sent || 1;
  const parts = [
    { label: "Coins held", value: held, color: C.navy },
    { label: "Received", value: recv, color: C.sky },
    { label: "Sent", value: sent, color: C.gold },
  ];
  return (
    <div className="ml-[26px] mr-1.5 mb-2 mt-1.5 space-y-2 rounded-[10px] border border-border bg-card p-2.5">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
        {parts.map((p) => (
          <div key={p.label} style={{ width: `${(p.value / total) * 100}%`, backgroundColor: p.color }} className="h-full" />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {parts.map((p) => (
          <div key={p.label} className="flex items-center gap-1.5">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="min-w-0">
              <span className="block truncate text-[10px] text-muted-foreground">{p.label}</span>
              <span className="block text-[12px] font-semibold tabular-nums text-foreground">{fmt(p.value, p.value < 10 ? 1 : 0)}</span>
            </span>
          </div>
        ))}
      </div>
      <a
        href={explorerAvatar(node.address)}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-[11px] font-medium text-[#00498B] hover:underline"
      >
        View on Circles explorer
        <ArrowUpRight className="h-3 w-3" />
      </a>
    </div>
  );
}
