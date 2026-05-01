import type { Metadata } from "next";
import Link from "next/link";

import { Header } from "@/components/layout/Header";
import { ProposalTimelineGroup } from "@/components/proposals/ProposalTimelineGroup";
import { VerifiableContractsCard } from "@/components/proposals/VerifiableContractsCard";
import { getProposals } from "@/lib/supabase";
import {
  deriveBlockAnchor,
  fetchGovernanceEvents,
  groupEventsByProposal,
  lowestProposalBlock,
} from "@/lib/governance-events";
import { de } from "@/lib/translations/de";

export const metadata: Metadata = {
  title: "Blockchain-Zeitleiste — Röbel/Müritz DAO",
  description:
    "Die mathematisch überprüfbare Geschichte aller Bürger-Vorschläge. Jedes Ereignis verlinkt direkt auf Basescan.",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProposalsTimelinePage() {
  const proposalsResult = await getProposals({
    orderBy: "created_at",
    orderDirection: "desc",
    limit: 1000,
  });

  const proposals = proposalsResult.success
    ? proposalsResult.data?.proposals ?? []
    : [];

  const fromBlock = lowestProposalBlock(proposals) ?? 0n;

  let groups: ReturnType<typeof groupEventsByProposal> = [];
  let fetchError: string | null = null;
  try {
    const events = await fetchGovernanceEvents(fromBlock);
    groups = groupEventsByProposal(events, proposals);
  } catch (err) {
    fetchError = err instanceof Error ? err.message : "Unknown error";
    console.error("[timeline] failed to fetch governance events:", err);
  }

  const anchor = deriveBlockAnchor(proposals);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-12">
        <div className="mx-auto max-w-4xl">
          <div className="mb-8">
            <Link
              href="/proposals"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              ← {de.proposals.title}
            </Link>
          </div>

          <header className="mb-10">
            <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-5xl">
              {de.governance.timelineTitle}
            </h1>
            <p className="mt-4 max-w-2xl text-base text-muted-foreground">
              {de.governance.timelineLead}
            </p>
          </header>

          <div className="space-y-8">
            <VerifiableContractsCard />

            {fetchError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/40">
                <p className="text-sm text-red-800 dark:text-red-200">
                  {de.errors.loadingDataFailed}: {fetchError}
                </p>
              </div>
            )}

            {groups.length === 0 && !fetchError ? (
              <div className="rounded-xl border border-border bg-card p-10 text-center shadow-sm">
                <p className="text-sm text-muted-foreground">
                  {de.governance.emptyState}
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {groups.map((group) => (
                  <ProposalTimelineGroup
                    key={group.proposalId}
                    group={group}
                    anchor={anchor}
                  />
                ))}
              </div>
            )}

            <p className="pt-4 text-xs text-muted-foreground">
              {de.governance.timelineFooter}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
