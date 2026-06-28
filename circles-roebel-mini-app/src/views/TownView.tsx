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
import { ShieldCheck, Users, Lock, Trophy, Activity, Download, Check, ChevronRight } from "../components/icons";
import RadialGraph, { type RadialNode } from "../components/RadialGraph";
import GrowCard from "../components/GrowCard";
import CsvFallbackSheet from "../components/CsvFallbackSheet";
import { DOCUMENTARY_VIDEOS } from "../lib/documentary";
import coinImg from "../assets/roebel-coin.png";
import roebelLogo from "../assets/roebel-logo.png";
import inviteImg from "../assets/invite-citizen.png";
import eventImg from "../assets/event-creation.png";

export default function TownView({
  connected,
  onOpenInvite,
  onOpenEvent,
  onOpenDocumentary,
}: {
  connected: Address | null;
  onOpenInvite: () => void;
  onOpenEvent: () => void;
  onOpenDocumentary: () => void;
}) {
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
              <Donut value={backing} label={backing >= 1 ? "100%" : pct(backing, 0)} sub="backed" color="#00498B" />
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

      {/* Citizen tools — bold, image-forward action cards */}
      <div className="grid grid-cols-2 gap-3">
        <ToolCard title="Invite Citizens" image={inviteImg} imgClassName="right-0 top-1/2 h-[122%] -translate-y-1/2 translate-x-[10%]" onClick={onOpenInvite} />
        <ToolCard title="Event Rewards" image={eventImg} imgClassName="right-0 top-1/2 h-[122%] -translate-y-1/2 translate-x-[7%]" onClick={onOpenEvent} />
      </div>

      {/* Video documentation — navy card with an animated stacked-thumbnail loop */}
      <VideoDocCard onClick={onOpenDocumentary} />

      {/* Your impact (connected) — sits directly above Grow Röbel */}
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

      {/* Grow Röbel — referral share with QR */}
      <GrowCard wallet={connected} />

      {/* Weekly CSV export — absolute bottom of the page */}
      <ExportCard verifiedSet={verifiedSet} rep={rep} citizens={citizens} />
    </div>
  );
}

// Bold, image-forward action card (Invite / Event). Big stacked headline top-left,
// a navy circular arrow bottom-left, and the artwork bleeding off the right edge.
function ToolCard({
  title,
  image,
  imgClassName = "",
  onClick,
}: {
  title: string;
  image: string;
  imgClassName?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group relative flex aspect-[3/2] flex-col justify-between overflow-hidden rounded-[16px] border border-border bg-card p-3.5 text-left shadow-sm transition hover:shadow-md active:scale-[0.99]"
    >
      <img
        src={image}
        alt=""
        aria-hidden
        className={`pointer-events-none absolute max-w-none select-none object-contain transition duration-300 group-hover:scale-105 ${imgClassName}`}
      />
      <h3 className="relative z-10 font-display text-xl font-extrabold uppercase leading-[1.04] tracking-tight text-foreground">
        {title.split(" ").map((w) => (
          <span key={w} className="block">
            {w}
          </span>
        ))}
      </h3>
      <span className="relative z-10 flex h-11 w-11 items-center justify-center rounded-full bg-[#00498B] text-white shadow-md transition group-hover:scale-105">
        <ChevronRight className="h-5 w-5" />
      </span>
    </button>
  );
}

// Navy "Video Documentation" card: stacked headline + outlined pill button on the
// left, an animated 3-thumbnail loop on the right.
function VideoDocCard({ onClick }: { onClick: () => void }) {
  // The three most recent episodes, front-most first.
  const thumbs = DOCUMENTARY_VIDEOS.slice(-3).reverse().map((v) => v.thumb);
  return (
    <button
      onClick={onClick}
      className="group relative block w-full overflow-hidden rounded-[18px] bg-[#00498B] p-4 text-left shadow-sm transition hover:shadow-md active:scale-[0.99]"
    >
      <div className="flex items-center gap-4">
        <div className="relative z-10 min-w-0 flex-1">
          <h3 className="font-display text-xl font-extrabold uppercase leading-[1.04] tracking-tight text-white">
            <span className="block">Video</span>
            <span className="block">Documentation</span>
          </h3>
          <span className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/80 px-4 py-2 text-[13px] font-semibold text-white transition group-hover:bg-white/10">
            Jetzt ansehen
            <ChevronRight className="h-4 w-4" />
          </span>
        </div>
        <div className="relative aspect-[5/4] w-[42%] shrink-0">
          <ThumbStack thumbs={thumbs} />
        </div>
      </div>
    </button>
  );
}

// Three fixed positions for the looping stack — front, middle, back. The back
// cards fan up and to the right so their edges peek out behind the front one.
const STACK_SLOTS = [
  { x: 0, y: 0, scale: 1, rot: 0, z: 30, o: 1 }, // front
  { x: 18, y: -16, scale: 0.9, rot: 4, z: 20, o: 0.92 }, // middle
  { x: 36, y: -32, scale: 0.8, rot: 8, z: 10, o: 0.8 }, // back
];

// Continuously rotates three thumbnails: the front card recedes all the way to the
// back while the next one rises to the front and scales up — a smooth, looping
// stack. Driven by a tick counter so CSS transitions (and instant z-index changes)
// animate each card between its fixed slots. Honours prefers-reduced-motion.
function ThumbStack({ thumbs }: { thumbs: string[] }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setTick((t) => t + 1), 2200);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="absolute inset-0" style={{ perspective: 900 }}>
      {thumbs.map((src, i) => {
        const slot = STACK_SLOTS[(((i - tick) % 3) + 3) % 3];
        return (
          <div
            key={i}
            className="absolute left-1/2 top-1/2 w-[88%]"
            style={{
              transform: `translate(calc(-50% + ${slot.x}px), calc(-50% + ${slot.y}px)) scale(${slot.scale}) rotate(${slot.rot}deg)`,
              zIndex: slot.z,
              opacity: slot.o,
              transition: "transform 900ms cubic-bezier(0.22, 1, 0.36, 1), opacity 900ms ease",
              willChange: "transform, opacity",
            }}
          >
            <div className="overflow-hidden rounded-[9px] border border-white/20 bg-black shadow-xl ring-1 ring-black/30">
              <img src={src} alt="" loading="lazy" className="aspect-video w-full object-cover" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Legend() {
  // Navy = in the group (filled = attester, outlined = verified citizen),
  // neutral = not yet trusted. No other colour.
  const items = [
    { l: "Verified citizen", style: { backgroundColor: "#E8EEF7", boxShadow: "inset 0 0 0 1.5px #00498B" } },
    { l: "Attester", style: { backgroundColor: "#00498B" } },
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
                className={`rounded-[7px] px-2 py-1 text-[11px] font-medium transition ${range === r ? "bg-[#00498B] text-white" : "text-muted-foreground hover:text-foreground"}`}
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
          <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium text-[#00498B]">
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
