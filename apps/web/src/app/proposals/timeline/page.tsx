import type { Metadata } from "next";
import Link from "next/link";

import { Header } from "@/components/layout/Header";
import { TimelineCanvas } from "@/components/proposals/TimelineCanvas";
import { getProposals } from "@/lib/supabase";
import {
  fetchGovernanceEvents,
  groupEventsByProposal,
  lowestProposalBlock,
  serializeGroups,
} from "@/lib/governance-events";
import { de } from "@/lib/translations/de";

export const metadata: Metadata = {
  title: "Blockchain-Zeitleiste — Röbel/Müritz DAO",
  description:
    "Die mathematisch überprüfbare Geschichte aller Bürger-Vorschläge auf einer interaktiven Blockchain-Leinwand.",
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

  let serializedGroups: ReturnType<typeof serializeGroups> = [];
  let fetchError: string | null = null;
  try {
    const events = await fetchGovernanceEvents(fromBlock);
    const groups = groupEventsByProposal(events, proposals);
    serializedGroups = serializeGroups(groups);
  } catch (err) {
    fetchError = err instanceof Error ? err.message : "Unknown error";
    console.error("[timeline] failed to fetch governance events:", err);
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 pt-6 pb-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <Link
            href="/proposals"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            ← {de.proposals.title}
          </Link>
        </div>

        <header className="mb-4">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {de.governance.timelineTitle}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {de.governance.timelineLead}
          </p>
        </header>

        {fetchError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/40">
            <p className="text-sm text-red-800 dark:text-red-200">
              {de.errors.loadingDataFailed}: {fetchError}
            </p>
          </div>
        ) : (
          <TimelineCanvas groups={serializedGroups} />
        )}
      </main>
    </div>
  );
}
