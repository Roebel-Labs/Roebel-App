// Economy pulse — the town's Röbel Coin flows and reputation: KPIs, a daily-volume area
// chart, flow composition, a reputation leaderboard, and a filterable flow feed.
import { useEffect, useMemo, useState } from "react";
import {
  getVerifiedSet,
  getRecentTransfers,
  getReputation,
  getProfiles,
  summarizeFlows,
  dailyVolume,
  flowLabel,
  type Transfer,
  type FlowKind,
  type RepNode,
  type Profile,
} from "../lib/circlesData";
import { explorerTx } from "../lib/citizens";
import { fmt, fmtInt, shortAddr, timeAgo } from "../lib/format";
import { ChartCard, PageHeader, KpiCard, Pill, ScoreBar, Skeleton, SkeletonGrid, EmptyHint, Avatar } from "../components/ui";
import { AreaChart, SplitBar } from "../components/charts";
import { Activity, Users, Flame, ArrowUpRight } from "../components/icons";
import coinImg from "../assets/roebel-coin.png";

const KINDS: (FlowKind | "all")[] = ["all", "mint", "reward", "spend", "transfer"];
const KIND_TONE: Record<FlowKind, "info" | "success" | "danger" | "violet"> = {
  mint: "info",
  reward: "success",
  spend: "danger",
  transfer: "violet",
};

export default function PulseView() {
  const [transfers, setTransfers] = useState<Transfer[] | null>(null);
  const [rep, setRep] = useState<RepNode[] | null>(null);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [filter, setFilter] = useState<FlowKind | "all">("all");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setTransfers(null);
    setRep(null);
    setProfiles(new Map());
    const verified = await getVerifiedSet().catch(() => new Set<string>());
    const [tf, rp] = await Promise.all([getRecentTransfers(150), getReputation(verified)]);
    setTransfers(tf);
    setRep(rp);
    setLoading(false);
    // Progressive enhancement: resolve real Circles names + pictures for everyone
    // shown (leaderboard + flow feed), then re-render. Best-effort — never blocks.
    const addrs = [...rp.slice(0, 12).map((n) => n.address), ...tf.flatMap((t) => [t.from, t.to])];
    getProfiles(addrs).then(setProfiles).catch(() => {});
  };
  useEffect(() => {
    void load();
  }, []);

  const summary = useMemo(() => summarizeFlows(transfers ?? []), [transfers]);
  const series = useMemo(() => dailyVolume(transfers ?? [], 14), [transfers]);
  const filtered = useMemo(() => (transfers ?? []).filter((t) => filter === "all" || t.kind === filter).slice(0, 40), [transfers, filter]);
  const maxScore = useMemo(() => Math.max(1, ...(rep ?? []).map((r) => r.score)), [rep]);
  const mintCount = summary.byKind.find((b) => b.kind === "mint")?.count ?? 0;
  const nameOf = (addr: string) => profiles.get(addr.toLowerCase())?.name || shortAddr(addr);

  return (
    <div className="space-y-4">
      <PageHeader title="Economy pulse" description="Live Röbel Coin flows and reputation across the town." onRefresh={load} refreshing={loading} />

      {/* KPIs */}
      {transfers === null ? (
        <SkeletonGrid count={4} />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <KpiCard label="Volume" value={fmt(summary.totalAmount, 0)} sub="Röbel Coins (recent)" tone="primary" icon={<img src={coinImg} alt="" className="h-6 w-6" />} />
          <KpiCard label="Transfers" value={fmtInt(summary.totalCount)} sub="on-chain events" tone="info" icon={<Activity className="h-5 w-5" />} />
          <KpiCard label="Active" value={fmtInt(summary.activeAddresses)} sub="wallets moving coins" tone="success" icon={<Users className="h-5 w-5" />} />
          <KpiCard label="Mints" value={fmtInt(mintCount)} sub="new coins minted" tone="warning" icon={<Flame className="h-5 w-5" />} />
        </div>
      )}

      {/* Daily volume area chart */}
      <ChartCard title="Daily volume" subtitle="Röbel Coins moved per day · last 14 days">
        {transfers === null ? (
          <Skeleton className="h-44" />
        ) : summary.totalAmount === 0 ? (
          <EmptyHint>No transfers yet — invite citizens to get the economy moving.</EmptyHint>
        ) : (
          <AreaChart series={[{ color: "#194383", points: series.map((d) => d.total) }]} labels={series.map((d) => d.label)} height={190} />
        )}
      </ChartCard>

      {/* Flow composition */}
      <ChartCard title="Flow composition" subtitle="Where coins move, by type">
        {transfers === null ? (
          <Skeleton className="h-20" />
        ) : (
          <div className="space-y-3">
            <SplitBar parts={summary.byKind.map((b) => ({ value: b.amount, color: b.color }))} />
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {summary.byKind.map((b) => (
                <div key={b.kind} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: b.color }} />
                  <span className="text-[13px] text-foreground">{b.label}</span>
                  <span className="ml-auto text-[13px] font-semibold tabular-nums text-foreground">{fmt(b.amount, 0)}</span>
                  <span className="w-9 text-right text-[11px] tabular-nums text-muted-foreground">{b.count}×</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </ChartCard>

      {/* Reputation leaderboard */}
      <ChartCard title="Reputation" subtitle="Coins held + flow activity · navy = verified citizen">
        {rep === null ? (
          <Skeleton className="h-40" />
        ) : rep.length === 0 ? (
          <EmptyHint>No reputation data yet.</EmptyHint>
        ) : (
          <ol className="space-y-2.5">
            {rep.slice(0, 12).map((n, i) => {
              const p = profiles.get(n.address.toLowerCase());
              return (
                <li key={n.address}>
                  <div className="mb-1 flex items-center gap-2.5">
                    <span className="w-4 shrink-0 text-right text-[11px] font-semibold tabular-nums text-muted-foreground">{i + 1}</span>
                    <a
                      href={`https://explorer.aboutcircles.com/avatar/${n.address}`}
                      target="_blank"
                      rel="noreferrer"
                      className="relative shrink-0"
                      title={n.verified ? "Verified citizen" : undefined}
                    >
                      <Avatar address={n.address} name={p?.name ?? null} imageUrl={p?.imageUrl ?? null} size={28} />
                      <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card ${n.verified ? "bg-[#194383]" : "bg-neutral-300"}`} />
                    </a>
                    <a
                      href={`https://explorer.aboutcircles.com/avatar/${n.address}`}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 flex-1 truncate text-[13px] font-medium leading-tight text-foreground hover:text-[#194383]"
                    >
                      {p?.name || shortAddr(n.address)}
                    </a>
                    <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
                      {fmt(n.held, 0)} · {n.inCount}↓ {n.outCount}↑
                    </span>
                  </div>
                  <div className="pl-[26px]">
                    <ScoreBar value={(n.score / maxScore) * 100} tone={n.verified ? "success" : "primary"} />
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </ChartCard>

      {/* Filterable flow feed */}
      <ChartCard title="Flow feed" subtitle="Most recent coin movements">
        <div className="no-scrollbar mb-3 flex gap-1 overflow-x-auto">
          {KINDS.map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition ${
                filter === k ? "bg-[#194383] text-white" : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {k === "all" ? "All" : flowLabel(k as FlowKind)}
            </button>
          ))}
        </div>
        {transfers === null ? (
          <Skeleton className="h-32" />
        ) : filtered.length === 0 ? (
          <EmptyHint>No flows of this type yet.</EmptyHint>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((t, i) => (
              <li key={t.tx + i}>
                <a href={explorerTx(t.tx)} target="_blank" rel="noreferrer" className="flex items-center gap-3 py-2.5 transition hover:opacity-80">
                  <Pill tone={KIND_TONE[t.kind]}>{flowLabel(t.kind)}</Pill>
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
    </div>
  );
}
