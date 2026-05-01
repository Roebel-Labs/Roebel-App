"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  Layers,
  Network,
  RefreshCw,
  ShieldCheck,
  TimerReset,
  Users,
  Vote,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useSocialGraph } from "@/hooks/useSocialGraph";
import { useDaoStats } from "@/hooks/useDaoStats";
import {
  formatAddress,
  getProposalStateLabel,
  ProposalState,
} from "@/lib/proposal-types";
import {
  approxTimestampMs,
  deriveBlockAnchor,
} from "@/lib/governance-events";
import { TimelineEventRow } from "@/components/proposals/TimelineEventRow";
import { KpiCard } from "@/components/admin/dao/KpiCard";
import {
  ProposalStatePieChart,
} from "@/components/admin/dao/ProposalStatePieChart";
import {
  CitizenGrowthChart,
  type GrowthPoint,
} from "@/components/admin/dao/CitizenGrowthChart";
import {
  TopAttestersBars,
  type TopAttesterRow,
} from "@/components/admin/dao/TopAttestersBars";
import {
  VoteParticipationBars,
  type ParticipationRow,
} from "@/components/admin/dao/VoteParticipationBars";
import {
  REQUEST_STATUS_COLORS,
  REQUEST_STATUS_LABELS,
} from "@/components/admin/dao/colors";

export const dynamic = "force-dynamic";

const BASE_BLOCK_TIME_SECONDS = 2;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function formatNumber(n: number): string {
  return new Intl.NumberFormat("de-DE").format(n);
}

function formatPercent(value: number, total: number): string {
  if (total === 0) return "0 %";
  return `${Math.round((value / total) * 100)} %`;
}

function FunnelBar({
  counts,
}: {
  counts: { pending: number; approved: number; rejected: number; executed: number; total: number };
}) {
  const total = counts.total;
  if (total === 0) {
    return (
      <p className="text-sm text-muted-foreground">Noch keine Anträge.</p>
    );
  }

  const segments = [
    { key: 0, value: counts.pending },
    { key: 1, value: counts.approved },
    { key: 2, value: counts.rejected },
    { key: 3, value: counts.executed },
  ];

  return (
    <div className="space-y-3">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
        {segments.map((segment) => {
          const width = (segment.value / total) * 100;
          if (width === 0) return null;
          return (
            <div
              key={segment.key}
              style={{ width: `${width}%`, backgroundColor: REQUEST_STATUS_COLORS[segment.key] }}
              title={`${REQUEST_STATUS_LABELS[segment.key]}: ${segment.value}`}
            />
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {segments.map((segment) => (
          <div key={segment.key} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: REQUEST_STATUS_COLORS[segment.key] }}
            />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">
                {REQUEST_STATUS_LABELS[segment.key]}
              </p>
              <p className="text-sm font-medium">
                {formatNumber(segment.value)}{" "}
                <span className="text-xs text-muted-foreground">
                  ({formatPercent(segment.value, total)})
                </span>
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatePieData(counts: {
  pending: number;
  active: number;
  canceled: number;
  defeated: number;
  succeeded: number;
  queued: number;
  expired: number;
  executed: number;
}) {
  return [
    { state: ProposalState.Pending, label: "Wartend", count: counts.pending },
    { state: ProposalState.Active, label: "Aktiv", count: counts.active },
    { state: ProposalState.Succeeded, label: "Angenommen", count: counts.succeeded },
    { state: ProposalState.Defeated, label: "Abgelehnt", count: counts.defeated },
    { state: ProposalState.Queued, label: "In Warteschlange", count: counts.queued },
    { state: ProposalState.Executed, label: "Ausgeführt", count: counts.executed },
    { state: ProposalState.Canceled, label: "Storniert", count: counts.canceled },
    { state: ProposalState.Expired, label: "Abgelaufen", count: counts.expired },
  ];
}

interface MintEvent {
  blockNumber: number;
  type: "attester" | "citizen";
}

function buildGrowthSeries(
  mints: MintEvent[],
  anchorBlock: bigint | null,
  anchorTimestampMs: number | null
): GrowthPoint[] {
  if (mints.length === 0) return [];

  const sorted = [...mints].sort((a, b) => a.blockNumber - b.blockNumber);

  const referenceBlock = anchorBlock !== null
    ? Number(anchorBlock)
    : sorted[0].blockNumber;
  const referenceTime = anchorTimestampMs ?? Date.now();

  const blockToMs = (block: number) =>
    referenceTime + (block - referenceBlock) * BASE_BLOCK_TIME_SECONDS * 1000;

  const buckets = new Map<number, { citizens: number; attesters: number }>();
  for (const mint of sorted) {
    const ms = blockToMs(mint.blockNumber);
    const bucket = Math.floor(ms / WEEK_MS) * WEEK_MS;
    const entry = buckets.get(bucket) ?? { citizens: 0, attesters: 0 };
    if (mint.type === "attester") {
      entry.attesters += 1;
    } else {
      entry.citizens += 1;
    }
    buckets.set(bucket, entry);
  }

  const ordered = Array.from(buckets.entries()).sort((a, b) => a[0] - b[0]);
  let cumCitizens = 0;
  let cumAttesters = 0;
  return ordered.map(([bucket, value]) => {
    cumCitizens += value.citizens;
    cumAttesters += value.attesters;
    return {
      weekLabel: new Date(bucket).toLocaleDateString("de-DE", {
        month: "short",
        day: "2-digit",
      }),
      cumulativeCitizens: cumCitizens + cumAttesters,
      cumulativeAttesters: cumAttesters,
    };
  });
}

function buildTopAttesters(
  edges: Array<{ source: string }>
): TopAttesterRow[] {
  const counts = new Map<string, number>();
  for (const edge of edges) {
    counts.set(edge.source, (counts.get(edge.source) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([address, approvals]) => ({
      fullAddress: address,
      shortAddress: formatAddress(address),
      approvals,
    }))
    .sort((a, b) => b.approvals - a.approvals)
    .slice(0, 6);
}

function buildParticipationRows(
  proposals: Array<{
    proposal_number: number;
    title: string;
    for_votes: string;
    against_votes: string;
    abstain_votes: string;
  }>
): ParticipationRow[] {
  return proposals
    .slice(0, 8)
    .map((p) => ({
      label: `#${p.proposal_number}`,
      forVotes: Number(p.for_votes ?? "0"),
      againstVotes: Number(p.against_votes ?? "0"),
      abstainVotes: Number(p.abstain_votes ?? "0"),
    }))
    .filter(
      (row) => row.forVotes + row.againstVotes + row.abstainVotes > 0
    );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="bg-card border border-border shadow-none">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-4 rounded" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16 mb-2" />
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="bg-card border border-border shadow-none">
            <CardHeader>
              <Skeleton className="h-5 w-40" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-56 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function DaoDashboardPage() {
  const dao = useDaoStats();
  const graph = useSocialGraph();

  const isLoading = dao.isLoading || graph.isLoading;
  const error = dao.error ?? graph.error;

  const refresh = () => {
    dao.refresh();
    graph.refresh();
  };

  const attesterNodes = useMemo(
    () => graph.nodes.filter((n) => n.type === "attester"),
    [graph.nodes]
  );
  const citizenOnlyNodes = useMemo(
    () => graph.nodes.filter((n) => n.type === "citizen"),
    [graph.nodes]
  );
  const totalCitizens = graph.nodes.length; // attesters are also citizens
  const totalAttesters = attesterNodes.length;

  const pendingRequestsTotal =
    (dao.stats?.attesterRequests.pending ?? 0) +
    (dao.stats?.citizenRequests.pending ?? 0);

  const activeProposals = dao.stats?.proposalCounts.active ?? 0;
  const totalProposals = dao.stats?.proposalCounts.total ?? 0;

  const blockAnchor = useMemo(
    () => (dao.stats ? deriveBlockAnchor(dao.stats.proposals) : null),
    [dao.stats]
  );

  const growthSeries = useMemo(() => {
    const mints: MintEvent[] = graph.nodes
      .filter((node) => node.mintedAt)
      .map((node) => ({
        blockNumber: Number(node.mintedAt),
        type: node.type,
      }));
    return buildGrowthSeries(
      mints,
      blockAnchor?.blockNumber ?? null,
      blockAnchor?.timestampMs ?? null
    );
  }, [graph.nodes, blockAnchor]);

  const topAttesters = useMemo(() => buildTopAttesters(graph.edges), [graph.edges]);

  const proposalsForChart = useMemo(
    () => dao.stats?.proposals ?? [],
    [dao.stats]
  );
  const participationRows = useMemo(
    () => buildParticipationRows(proposalsForChart),
    [proposalsForChart]
  );

  const recentEvents = useMemo(() => {
    if (!dao.stats) return [];
    return [...dao.stats.events]
      .sort((a, b) => Number(b.blockNumber - a.blockNumber))
      .slice(0, 10);
  }, [dao.stats]);

  const proposalCounts = useMemo(
    () =>
      dao.stats?.proposalCounts ?? {
        total: 0,
        pending: 0,
        active: 0,
        canceled: 0,
        defeated: 0,
        succeeded: 0,
        queued: 0,
        expired: 0,
        executed: 0,
      },
    [dao.stats]
  );

  const turnoutPct = useMemo(() => {
    if (!dao.stats || totalCitizens === 0) return 0;
    return Math.min(
      100,
      Math.round((dao.stats.uniqueVoters / totalCitizens) * 100)
    );
  }, [dao.stats, totalCitizens]);

  const successRate = useMemo(() => {
    const decided =
      proposalCounts.succeeded +
      proposalCounts.defeated +
      proposalCounts.executed +
      proposalCounts.canceled +
      proposalCounts.expired;
    if (decided === 0) return null;
    const positive = proposalCounts.succeeded + proposalCounts.executed;
    return Math.round((positive / decided) * 100);
  }, [proposalCounts]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Header onRefresh={refresh} lastUpdated={null} isLoading />
        <LoadingSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Header
        onRefresh={refresh}
        lastUpdated={dao.lastUpdated ?? graph.lastUpdated}
        isLoading={false}
      />

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/40">
          <p className="text-sm text-red-800 dark:text-red-200">
            Daten konnten nicht vollständig geladen werden: {error}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Verifizierte Bürger"
          value={formatNumber(totalCitizens)}
          hint={`davon ${totalAttesters} Bescheiniger`}
          icon={Users}
        />
        <KpiCard
          label="Bescheiniger"
          value={formatNumber(totalAttesters)}
          hint={`${citizenOnlyNodes.length} reine Bürger`}
          icon={ShieldCheck}
        />
        <KpiCard
          label="Offene Anträge"
          value={formatNumber(pendingRequestsTotal)}
          hint="warten auf Signaturen"
          icon={Clock}
        />
        <KpiCard
          label="Aktive Proposals"
          value={formatNumber(activeProposals)}
          hint={`${totalProposals} Proposals gesamt`}
          icon={Vote}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="bg-card border border-border shadow-none lg:col-span-2">
          <CardHeader>
            <CardTitle>Wachstum der Verifizierungen</CardTitle>
            <CardDescription>
              Kumulierte Bürger und Bescheiniger pro Woche, abgeleitet aus On-Chain-Mints.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CitizenGrowthChart data={growthSeries} />
          </CardContent>
        </Card>

        <Card className="bg-card border border-border shadow-none">
          <CardHeader>
            <CardTitle>Wahlbeteiligung</CardTitle>
            <CardDescription>
              Bürger, die mindestens einmal abgestimmt haben.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-3xl font-medium">{turnoutPct} %</div>
              <p className="text-xs text-muted-foreground">
                {dao.stats?.uniqueVoters ?? 0} von {totalCitizens} Bürger:innen
              </p>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${turnoutPct}%`, backgroundColor: "#194383" }}
              />
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Stimmen gesamt</p>
                <p className="font-medium">
                  {formatNumber(dao.stats?.totalVotesCast ?? 0)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Erfolgsquote</p>
                <p className="font-medium">
                  {successRate === null ? "—" : `${successRate} %`}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="bg-card border border-border shadow-none">
          <CardHeader>
            <CardTitle>Verifizierungs-Trichter</CardTitle>
            <CardDescription>
              Status aller Anträge auf AttesterNFT und CitizenNFT.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium">Bescheiniger-Anträge</span>
                <Badge variant="outline">
                  {dao.stats?.attesterRequests.total ?? 0} gesamt
                </Badge>
              </div>
              <FunnelBar
                counts={
                  dao.stats?.attesterRequests ?? {
                    pending: 0,
                    approved: 0,
                    rejected: 0,
                    executed: 0,
                    total: 0,
                  }
                }
              />
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium">Bürger-Anträge</span>
                <Badge variant="outline">
                  {dao.stats?.citizenRequests.total ?? 0} gesamt
                </Badge>
              </div>
              <FunnelBar
                counts={
                  dao.stats?.citizenRequests ?? {
                    pending: 0,
                    approved: 0,
                    rejected: 0,
                    executed: 0,
                    total: 0,
                  }
                }
              />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border border-border shadow-none">
          <CardHeader>
            <CardTitle>Proposal-Verteilung</CardTitle>
            <CardDescription>
              Anteil der Proposals nach Lebenszyklus-Phase.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProposalStatePieChart data={StatePieData(proposalCounts)} />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="bg-card border border-border shadow-none">
          <CardHeader>
            <CardTitle>Top-Bescheiniger</CardTitle>
            <CardDescription>
              Wer hat am häufigsten andere Bürger verifiziert?
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TopAttestersBars data={topAttesters} />
          </CardContent>
        </Card>

        <Card className="bg-card border border-border shadow-none">
          <CardHeader>
            <CardTitle>Stimmverteilung pro Proposal</CardTitle>
            <CardDescription>
              Dafür / Dagegen / Enthaltung — letzte {participationRows.length} Proposals.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <VoteParticipationBars data={participationRows} />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Link
          href="/graph"
          target="_blank"
          rel="noopener noreferrer"
          className="group block focus:outline-none"
        >
          <Card className="bg-card border border-border shadow-none transition-colors hover:border-primary/50 hover:bg-accent/40">
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2">
                    <Network className="h-5 w-5 text-muted-foreground" />
                    Bürger-Netzwerk öffnen
                  </CardTitle>
                  <CardDescription>
                    Interaktiver Graph aller Bescheiniger und Bürger inkl.
                    Verifizierungs-Beziehungen.
                  </CardDescription>
                </div>
                <ArrowUpRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <Badge variant="secondary">{totalCitizens} Knoten</Badge>
                <Badge variant="secondary">{graph.edges.length} Kanten</Badge>
                <span className="text-xs">
                  Öffnet <code className="font-mono">/graph</code> in neuem Tab
                </span>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link
          href="/proposals/timeline"
          target="_blank"
          rel="noopener noreferrer"
          className="group block focus:outline-none"
        >
          <Card className="bg-card border border-border shadow-none transition-colors hover:border-primary/50 hover:bg-accent/40">
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2">
                    <Layers className="h-5 w-5 text-muted-foreground" />
                    Proposal-Zeitleiste öffnen
                  </CardTitle>
                  <CardDescription>
                    Mathematisch überprüfbare Geschichte aller Bürger-Vorschläge mit
                    Basescan-Verlinkung.
                  </CardDescription>
                </div>
                <ArrowUpRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <Badge variant="secondary">
                  {dao.stats?.events.length ?? 0} Ereignisse
                </Badge>
                <Badge variant="secondary">{totalProposals} Proposals</Badge>
                <span className="text-xs">
                  Öffnet <code className="font-mono">/proposals/timeline</code> in
                  neuem Tab
                </span>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      <Card className="bg-card border border-border shadow-none">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Letzte Governance-Aktivität</CardTitle>
              <CardDescription>
                Die zehn jüngsten On-Chain-Ereignisse aus AttesterGovernor.
              </CardDescription>
            </div>
            <Link
              href="/proposals/timeline"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Vollständige Zeitleiste <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {recentEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Noch keine Aktivität.
            </p>
          ) : (
            <ul className="relative border-l border-border pl-2">
              {recentEvents.map((ev) => (
                <TimelineEventRow
                  key={`${ev.kind}-${ev.txHash}-${ev.proposalId}`}
                  event={ev}
                  approxTimestampMs={approxTimestampMs(ev.blockNumber, blockAnchor)}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {dao.stats && proposalsForChart.length > 0 && (
        <Card className="bg-card border border-border shadow-none">
          <CardHeader>
            <CardTitle>Aktuelle Proposals</CardTitle>
            <CardDescription>
              Status der zuletzt erstellten Vorschläge.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border">
              {proposalsForChart.slice(0, 6).map((p) => (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      <span className="text-muted-foreground">#{p.proposal_number}</span>{" "}
                      {p.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      von {formatAddress(p.proposer_address)} ·{" "}
                      {new Date(p.created_at).toLocaleDateString("de-DE")}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="text-xs">
                      {getProposalStateLabel(p.state)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      <CheckCircle2 className="mr-1 inline h-3 w-3 text-emerald-500" />
                      {formatNumber(Number(p.for_votes ?? "0"))}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      <TimerReset className="mr-1 inline h-3 w-3 text-red-500" />
                      {formatNumber(Number(p.against_votes ?? "0"))}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Header({
  onRefresh,
  lastUpdated,
  isLoading,
}: {
  onRefresh: () => void;
  lastUpdated: Date | null;
  isLoading: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">DAO &amp; Bürger</h1>
        <p className="text-sm text-muted-foreground">
          Verifizierte Bürger, Bescheiniger und Governance-Aktivität auf Base.
          {lastUpdated && (
            <>
              {" "}
              Stand: {lastUpdated.toLocaleTimeString("de-DE")}
            </>
          )}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onRefresh}
        disabled={isLoading}
      >
        <RefreshCw
          className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
        />
        Aktualisieren
      </Button>
    </div>
  );
}
