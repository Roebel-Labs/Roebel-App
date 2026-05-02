import type { Metadata } from "next";
import Link from "next/link";

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
    <div className="flex h-screen flex-col bg-background">
      <div className="border-b border-border bg-card shadow-sm">
        <div className="container mx-auto flex flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-medium text-foreground">
              {de.governance.timelineTitle}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {de.governance.timelineLead}
            </p>
          </div>
          <Link
            href="/proposals"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            ← {de.proposals.title}
          </Link>
        </div>
      </div>

      <div className="relative flex-1 min-h-0">
        {fetchError ? (
          <div className="flex h-full items-center justify-center px-4">
            <div className="max-w-md rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/40">
              <p className="text-sm text-red-800 dark:text-red-200">
                {de.errors.loadingDataFailed}: {fetchError}
              </p>
            </div>
          </div>
        ) : (
          <TimelineCanvas groups={serializedGroups} />
        )}
      </div>
    </div>
  );
}
