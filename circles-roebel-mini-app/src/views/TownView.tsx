// Town overview — referral share, personal impact, KPIs, collateral backing,
// verification, the trust graph, and a weekly CSV export of the on-chain economy.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Address } from "viem";
import {
  getVerifiedSet,
  getTownStats,
  getTrustGraph,
  getReputation,
  getMyImpact,
  getRecentTransfers,
  getProfiles,
  type TownStats,
  type TrustGraph,
  type RepNode,
  type Profile,
} from "../lib/circlesData";
import { ROEBEL_CITIZENS, type Citizen } from "../lib/citizens";
import { fetchRoebelCitizens } from "../lib/citizens-onchain";
import { fmt, fmtInt, pct, shortAddr } from "../lib/format";
import { toCsv, exportCsv, todayStamp } from "../lib/csv";
import { track } from "../lib/analytics";
import { ChartCard, PageHeader, KpiCard, SkeletonGrid, Skeleton, ScoreBar } from "../components/ui";
import { Donut } from "../components/charts";
import { ShieldCheck, Users, Lock, Trophy, Activity, Download, Check } from "../components/icons";
import RadialGraph, { type RadialNode } from "../components/RadialGraph";
import GrowCard from "../components/GrowCard";
import CsvFallbackSheet from "../components/CsvFallbackSheet";
import coinImg from "../assets/roebel-coin.png";
import roebelLogo from "../assets/roebel-logo.png";

export default function TownView({ connected }: { connected: Address | null }) {
  const [stats, setStats] = useState<TownStats | null>(null);
  const [graph, setGraph] = useState<TrustGraph | null>(null);
  const [rep, setRep] = useState<RepNode[] | null>(null);
  const [verifiedSet, setVerifiedSet] = useState<Set<string>>(new Set());
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  // Live citizen list from the on-chain CitizenNFTv2 contract; seeded with the static
  // fallback so first render is instant and offline is correct. Auto-includes new citizens.
  const [citizens, setCitizens] = useState<Citizen[]>(ROEBEL_CITIZENS);
  const [loading, setLoading] = useState(true);

  // Pull the dynamic list once (falls back to the static snapshot on RPC failure).
  useEffect(() => {
    fetchRoebelCitizens().then(setCitizens).catch(() => {});
  }, []);

  // Resolve each citizen's real Circles avatar name + picture (re-runs as the list loads).
  useEffect(() => {
    getProfiles(citizens.map((c) => c.address)).then(setProfiles).catch(() => {});
  }, [citizens]);

  const load = useCallback(async () => {
    setLoading(true);
    const verified = await getVerifiedSet();
    setVerifiedSet(verified);
    const [s, g, r] = await Promise.all([getTownStats(verified.size), getTrustGraph(verified), getReputation(verified)]);
    setStats(s);
    setGraph(g);
    setRep(r);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const nodes: RadialNode[] = (graph?.nodes ?? []).map((nd) => {
    const p = profiles.get(nd.id.toLowerCase());
    return {
      id: nd.id,
      address: nd.id,
      label: p?.name || shortAddr(nd.id),
      name: p?.name ?? null,
      imageUrl: p?.imageUrl ?? null,
      tone: nd.tone,
      dashed: !nd.trusted,
    };
  });
  const backing = stats && stats.supply > 0 ? stats.collateral / stats.supply : 0;
  const verifiedPct = stats && stats.citizens > 0 ? (stats.verified / stats.citizens) * 100 : 0;
  const impact = useMemo(() => (connected && rep ? getMyImpact(connected, rep) : null), [connected, rep]);

  return (
    <div className="space-y-4">
      <PageHeader title="Town overview" description="The town's on-chain economy, live from Circles v2 on Gnosis." onRefresh={load} refreshing={loading} />

      {/* Referral share — bring a new wallet into the app */}
      <GrowCard wallet={connected} />

      {/* Your impact (connected) */}
      {connected && (
        <ChartCard title="Your impact" subtitle="Your standing in the town economy">
          {!impact ? (
            <Skeleton className="h-[74px]" />
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <KpiCard label="Your coins" value={fmt(impact.balance, 0)} sub="Röbel Coins" tone="primary" icon={<img src={coinImg} alt="" className="h-6 w-6" />} />
              <KpiCard label="Your rank" value={impact.rank ? `#${impact.rank}` : "—"} sub={`of ${impact.total}`} tone="success" icon={<Trophy className="h-5 w-5" />} />
              <KpiCard label="Flows" value={`${impact.inCount}↓ ${impact.outCount}↑`} sub="in / out" tone="info" icon={<Activity className="h-5 w-5" />} />
            </div>
          )}
        </ChartCard>
      )}

      {/* KPI grid */}
      {!stats ? (
        <SkeletonGrid count={4} />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <KpiCard label="Verified" value={`${stats.verified}/${stats.citizens}`} sub="citizens" tone="success" icon={<ShieldCheck className="h-5 w-5" />} />
          <KpiCard label="Supply" value={fmt(stats.supply, 0)} sub="Röbel Coins" tone="primary" icon={<img src={coinImg} alt="" className="h-6 w-6" />} />
          <KpiCard label="Holders" value={fmtInt(stats.holders)} sub="wallets" tone="info" icon={<Users className="h-5 w-5" />} />
          <KpiCard label="Collateral" value={fmt(stats.collateral, 0)} sub="personal CRC locked" tone="violet" icon={<Lock className="h-5 w-5" />} />
        </div>
      )}

      {/* Backing + verification */}
      <div className="grid grid-cols-2 gap-3">
        <ChartCard title="Backing" subtitle="Collateral ÷ supply">
          {!stats ? (
            <Skeleton className="h-[132px]" />
          ) : (
            <div className="flex flex-col items-center">
              <Donut value={backing} label={backing >= 1 ? "100%" : pct(backing, 0)} sub="backed" color="#194383" />
              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                {backing >= 0.999 ? "Every coin is fully backed 1:1." : "Each coin is backed by locked personal CRC."}
              </p>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Verification" subtitle="Citizens onboarded">
          {!stats ? (
            <Skeleton className="h-[132px]" />
          ) : (
            <div className="flex h-full flex-col justify-center gap-3">
              <div>
                <div className="text-3xl font-semibold leading-none tracking-tight text-foreground tnum">{pct(verifiedPct / 100, 0)}</div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {stats.verified} of {stats.citizens} verified
                </div>
              </div>
              <ScoreBar value={verifiedPct} tone="success" />
              <div className="text-[11px] text-muted-foreground">
                {stats.citizens - stats.verified === 0 ? "All citizens verified 🎉" : `${stats.citizens - stats.verified} still to onboard`}
              </div>
            </div>
          )}
        </ChartCard>
      </div>

      {/* Trust graph */}
      <ChartCard title="Trust graph" subtitle="Citizens trusted by the Röbel Coin group">
        {loading && !graph ? (
          <Skeleton className="h-64" />
        ) : (
          <>
            <RadialGraph
              center={{ label: graph?.centerLabel ?? "Röbel Coins", sub: stats ? `${stats.verified} verified` : undefined, imageUrl: roebelLogo }}
              nodes={nodes}
              emptyLabel="no citizens yet"
            />
            <Legend />
          </>
        )}
      </ChartCard>

      {/* Weekly CSV export */}
      <ExportCard verifiedSet={verifiedSet} rep={rep} citizens={citizens} />
    </div>
  );
}

function Legend() {
  // Navy = in the group (filled = attester, outlined = verified citizen),
  // neutral = not yet trusted. No other colour.
  const items = [
    { l: "Verified citizen", style: { backgroundColor: "#E8EEF7", boxShadow: "inset 0 0 0 1.5px #194383" } },
    { l: "Attester", style: { backgroundColor: "#194383" } },
    { l: "Not yet trusted", style: { backgroundColor: "#A3A3A3" } },
  ];
  return (
    <div className="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
      {items.map((i) => (
        <span key={i.l} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="h-2.5 w-2.5 rounded-full" style={i.style} />
          {i.l}
        </span>
      ))}
    </div>
  );
}

function ExportCard({ verifiedSet, rep, citizens }: { verifiedSet: Set<string>; rep: RepNode[] | null; citizens: Citizen[] }) {
  const [range, setRange] = useState<"7d" | "all">("7d");
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [fallback, setFallback] = useState<{ filename: string; csv: string } | null>(null);

  // Deliver a CSV the most reliable way the host allows; fall back to an in-app
  // copy/preview sheet if downloads AND the share sheet are both blocked.
  const deliver = async (kind: string, filename: string, csv: string, extra: Record<string, unknown> = {}) => {
    if (!csv) {
      setToast("Nothing to export");
      setTimeout(() => setToast(null), 1800);
      track("csv_export", { kind, rows: 0, empty: true, ...extra });
      return;
    }
    const res = await exportCsv(filename, csv);
    track("csv_export", { kind, method: res, ...extra });
    if (res === "fallback") {
      setFallback({ filename, csv });
    } else if (res === "shared" || res === "downloaded") {
      setToast(res === "shared" ? "Shared ✓" : "Downloaded ✓");
      setTimeout(() => setToast(null), 1800);
    }
  };

  const run = (kind: string, fn: () => Promise<void> | void) => async () => {
    setBusy(kind);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  const exportTransfers = run("transfers", async () => {
    const all = await getRecentTransfers(200);
    const cutoff = Math.floor(Date.now() / 1000) - 7 * 86400;
    const rows = all
      .filter((t) => (range === "all" ? true : t.time >= cutoff))
      .map((t) => ({
        date: t.time ? new Date(t.time * 1000).toISOString() : "",
        kind: t.kind,
        from: t.from,
        to: t.to,
        amount: t.amount,
        tx: t.tx,
      }));
    await deliver("transfers", `roebel-transfers-${todayStamp()}.csv`, toCsv(rows, ["date", "kind", "from", "to", "amount", "tx"]), {
      rows: rows.length,
      range,
    });
  });

  const exportCitizens = run("citizens", async () => {
    const rows = citizens.map((c) => ({ address: c.address, attester: c.attester, verified: verifiedSet.has(c.address.toLowerCase()) }));
    await deliver("citizens", `roebel-citizens-${todayStamp()}.csv`, toCsv(rows, ["address", "attester", "verified"]), { rows: rows.length });
  });

  const exportReputation = run("reputation", async () => {
    const rows = (rep ?? []).map((r, i) => ({
      rank: i + 1,
      address: r.address,
      held: r.held,
      inCount: r.inCount,
      outCount: r.outCount,
      score: r.score,
      verified: r.verified,
    }));
    await deliver("reputation", `roebel-reputation-${todayStamp()}.csv`, toCsv(rows, ["rank", "address", "held", "inCount", "outCount", "score", "verified"]), {
      rows: rows.length,
    });
  });

  const btn =
    "inline-flex items-center justify-center gap-2 rounded-[10px] border border-border bg-card px-3 py-2.5 text-[13px] font-medium text-foreground transition hover:bg-muted active:scale-[0.99] disabled:opacity-50";

  return (
    <>
      <ChartCard
        title="Export data"
        subtitle="Download the town's on-chain activity as CSV."
        action={
          <div className="flex rounded-[10px] border border-border p-0.5">
            {(["7d", "all"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`rounded-[7px] px-2 py-1 text-[11px] font-medium transition ${range === r ? "bg-[#194383] text-white" : "text-muted-foreground hover:text-foreground"}`}
              >
                {r === "7d" ? "Last 7 days" : "All"}
              </button>
            ))}
          </div>
        }
      >
        <div className="grid grid-cols-3 gap-2">
          <button onClick={exportTransfers} disabled={!!busy} className={btn}>
            <Download className="h-4 w-4" />
            {busy === "transfers" ? "…" : "Transfers"}
          </button>
          <button onClick={exportCitizens} disabled={!!busy} className={btn}>
            <Download className="h-4 w-4" />
            {busy === "citizens" ? "…" : "Citizens"}
          </button>
          <button onClick={exportReputation} disabled={!!busy || !rep} className={btn}>
            <Download className="h-4 w-4" />
            {busy === "reputation" ? "…" : "Reputation"}
          </button>
        </div>
        {toast ? (
          <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium text-[#194383]">
            <Check className="h-3.5 w-3.5" />
            {toast}
          </p>
        ) : (
          <p className="mt-2 text-[11px] text-muted-foreground">Transfers honour the range; citizens & reputation are a current snapshot.</p>
        )}
      </ChartCard>

      {fallback && <CsvFallbackSheet filename={fallback.filename} csv={fallback.csv} onClose={() => setFallback(null)} />}
    </>
  );
}
