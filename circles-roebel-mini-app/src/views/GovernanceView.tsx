// Governance tab — the town's on-chain governance in one read-only view:
//   • Gemeinschaftskasse (town treasury) balance
//   • all proposals, status-grouped (Active first, then closed)
//   • tap a proposal → full detail with the Irys body (see ProposalDetailView)
// Voting stays private in the Röbel app. Best-effort fetches → never throws.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getTreasury, type Treasury } from "../lib/treasury";
import { getProposals, getMaciSignups, isActiveState, stateLabel, tally, type Proposal } from "../lib/proposals";
import { ChartCard, PageHeader, KpiCard, Pill, Skeleton, EmptyHint, SectionTitle } from "../components/ui";
import { SplitBar } from "../components/charts";
import { BallotBox, Vault, Users, Lock, ChevronRight } from "../components/icons";
import { fmt } from "../lib/format";
import { track } from "../lib/analytics";
import ProposalDetailView from "./ProposalDetailView";

const VOTE_COLORS = { for: "#00498B", against: "#94a3b8", abstain: "#cbd5e1" } as const;

export default function GovernanceView({ initialProposalId = null }: { initialProposalId?: string | null }) {
  const [treasury, setTreasury] = useState<Treasury | null>(null);
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [signups, setSignups] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(initialProposalId);
  const [loading, setLoading] = useState(true);
  const deepLinked = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [tre, props] = await Promise.all([getTreasury(), getProposals()]);
    setTreasury(tre);
    setProposals(props);
    setLoading(false);
    // The electorate = MACI sign-ups (registered voting keys), the same number the
    // apps/web admin "DAO & Bürger" page shows. Fill in after the core view.
    getMaciSignups().then(setSignups).catch(() => {});
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  // A ?proposal=<id> deep-link opens straight onto the matching detail once loaded.
  useEffect(() => {
    if (deepLinked.current || !initialProposalId || !proposals) return;
    deepLinked.current = true;
    const hit = proposals.find(
      (p) => p.proposal_id === initialProposalId || p.transaction_hash === initialProposalId,
    );
    if (hit) setSelectedId(hit.proposal_id);
  }, [initialProposalId, proposals]);

  const selected = useMemo(
    () => proposals?.find((p) => p.proposal_id === selectedId) ?? null,
    [proposals, selectedId],
  );

  const open = (p: Proposal) => {
    setSelectedId(p.proposal_id);
    track("proposal_open", { id: p.proposal_id, state: p.state });
  };

  if (selected) {
    return <ProposalDetailView proposal={selected} onBack={() => setSelectedId(null)} />;
  }

  const active = (proposals ?? []).filter((p) => isActiveState(p.state));
  const closed = (proposals ?? []).filter((p) => !isActiveState(p.state));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Governance"
        description="The town treasury and proposals, live on Gnosis. Vote privately in the Röbel app."
        onRefresh={load}
        refreshing={loading}
      />

      {/* Town treasury */}
      <ChartCard title="Town treasury" subtitle="Gemeinschaftskasse · Safe multisig on Gnosis">
        {!treasury ? (
          <Skeleton className="h-[120px]" />
        ) : (
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Reserve balance</div>
            <div className="mt-1 text-4xl font-semibold leading-none tracking-tight text-foreground tnum">€{fmt(treasury.euro, 2)}</div>
            <div className="mt-4 space-y-2.5 border-t border-border pt-3.5">
              <AssetRow label="xDAI" sub="Network currency" value={fmt(treasury.xdai, 2)} />
              <AssetRow label="EURe" sub="Euro stablecoin" value={fmt(treasury.eure, 2)} />
              <AssetRow label="Röbel-Münzen" sub="Community token" value={fmt(treasury.muenzen, 0)} />
            </div>
          </div>
        )}
      </ChartCard>

      {/* Governance KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <KpiCard
          label="Open"
          value={proposals ? active.length : "—"}
          sub="proposals"
          tone="primary"
          icon={<BallotBox className="h-5 w-5" />}
        />
        <KpiCard
          label="Total"
          value={proposals ? proposals.length : "—"}
          sub="proposals"
          tone="info"
          icon={<Vault className="h-5 w-5" />}
        />
        <KpiCard
          label="Registered"
          value={signups ?? "—"}
          sub="to vote"
          tone="success"
          icon={<Users className="h-5 w-5" />}
        />
      </div>

      {/* Proposals */}
      {!proposals ? (
        <div className="space-y-3">
          <Skeleton className="h-[96px]" />
          <Skeleton className="h-[96px]" />
        </div>
      ) : proposals.length === 0 ? (
        <EmptyHint>No proposals yet. New proposals from the Röbel app appear here.</EmptyHint>
      ) : (
        <div className="space-y-4">
          {active.length > 0 && (
            <div className="space-y-2.5">
              <SectionTitle>Active</SectionTitle>
              {active.map((p) => (
                <ProposalCard key={p.proposal_id} p={p} onClick={() => open(p)} />
              ))}
            </div>
          )}
          {closed.length > 0 && (
            <div className="space-y-2.5">
              <SectionTitle>Closed</SectionTitle>
              {closed.map((p) => (
                <ProposalCard key={p.proposal_id} p={p} onClick={() => open(p)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AssetRow({ label, sub, value }: { label: string; sub: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-foreground">{label}</div>
        <div className="text-[11px] text-muted-foreground">{sub}</div>
      </div>
      <div className="shrink-0 text-[15px] font-semibold text-foreground tnum">{value}</div>
    </div>
  );
}

function ProposalCard({ p, onClick }: { p: Proposal; onClick: () => void }) {
  const active = isActiveState(p.state);
  const t = tally(p);
  return (
    <button
      onClick={onClick}
      className="block w-full rounded-[10px] border border-border bg-card p-4 text-left shadow-sm transition hover:bg-muted active:scale-[0.99]"
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        {p.category && <Pill tone="muted">{p.category}</Pill>}
        <Pill tone={active ? "primary" : "muted"}>{stateLabel(p.state)}</Pill>
        {p.proposal_number != null && <span className="ml-auto text-[11px] text-muted-foreground">#{p.proposal_number}</span>}
      </div>
      <div className="flex items-start gap-2">
        <h4 className="min-w-0 flex-1 text-sm font-semibold leading-snug text-foreground line-clamp-2">{p.title}</h4>
        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      </div>
      {p.summary && <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground line-clamp-2">{p.summary}</p>}
      <div className="mt-2.5">
        {active && t.total === 0 ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Lock className="h-3.5 w-3.5 text-[#00498B]" />
            Voting in progress — encrypted
          </span>
        ) : t.total > 0 ? (
          <SplitBar
            parts={[
              { value: t.forV, color: VOTE_COLORS.for },
              { value: t.against, color: VOTE_COLORS.against },
              { value: t.abstain, color: VOTE_COLORS.abstain },
            ]}
          />
        ) : (
          <span className="text-[11px] text-muted-foreground">No votes recorded</span>
        )}
      </div>
    </button>
  );
}
