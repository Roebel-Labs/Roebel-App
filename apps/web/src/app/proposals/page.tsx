"use client";

export const dynamic = "force-dynamic";

import { Header } from "@/components/layout/Header";
import { useActiveAccount } from "thirdweb/react";
import Link from "next/link";
import { ProposalCard } from "@/components/proposals/ProposalCard";
import { useEffect, useState } from "react";
import { getProposals } from "@/lib/supabase";
import type { Proposal } from "@/lib/proposal-types";
import { de } from "@/lib/translations/de";

export default function ProposalsPage() {
  const account = useActiveAccount();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch proposals from Supabase
  useEffect(() => {
    async function fetchProposals() {
      setIsLoading(true);
      setError(null);

      console.log("📋 Fetching proposals from Supabase...");

      const result = await getProposals({
        orderBy: "created_at",
        orderDirection: "desc",
        limit: 50,
      });

      if (result.success && result.data) {
        setProposals(result.data.proposals);
        console.log(`✅ Loaded ${result.data.proposals.length} proposals`);
      } else {
        setError(result.error || "Failed to load proposals");
        console.error("❌ Failed to load proposals:", result.error);
      }

      setIsLoading(false);
    }

    fetchProposals();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-12">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8">
            <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
              {de.navigation.backToDashboard}
            </Link>
          </div>

          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
            <div>
              <h1 className="text-3xl font-medium text-foreground">{de.proposals.title}</h1>
              <p className="text-muted-foreground mt-1">{de.proposals.subtitle}</p>
            </div>
            <Link
              href="/proposals/create"
              className="inline-flex items-center justify-center bg-black hover:bg-foreground/90 text-white px-6 py-3 rounded-lg transition-colors font-medium"
            >
              {de.proposals.createProposal}
            </Link>
          </div>

          <div className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-800">{de.errors.loadingDataFailed}: {error}</p>
              </div>
            )}

            <div className="bg-card border border-border rounded-xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-medium text-foreground">{de.proposals.allProposals}</h2>
                <span className="text-sm text-muted-foreground bg-muted px-3 py-1 rounded-full">
                  Gesamt: {proposals.length}
                </span>
              </div>

              {isLoading ? (
                <div className="text-center py-12">
                  <div className="inline-block w-8 h-8 border-4 border-black border-t-transparent rounded-full animate-spin mb-4" />
                  <p className="text-muted-foreground">{de.proposals.loadingProposals}</p>
                </div>
              ) : proposals.length > 0 ? (
                <div className="space-y-4">
                  {proposals.map((proposal: Proposal) => (
                    <ProposalCard
                      key={proposal.id}
                      proposal={proposal}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-muted-foreground mb-4">{de.proposals.noProposals}</p>
                  {account && (
                    <Link
                      href="/proposals/create"
                      className="inline-block bg-black hover:bg-foreground/90 text-white px-6 py-3 rounded-lg transition-colors font-medium"
                    >
                      {de.proposals.createFirstProposal}
                    </Link>
                  )}
                </div>
              )}
            </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl shadow-sm p-6">
                <h3 className="text-lg font-medium mb-4 text-blue-900">{de.proposals.howVotingWorks}</h3>
                <div className="space-y-3 text-blue-800 text-sm">
                  {de.proposals.votingInfo.map((info, index) => (
                    <div key={index} className="flex items-start gap-3">
                      <span className="font-medium">{index + 1}.</span>
                      <span>{info}</span>
                    </div>
                  ))}
                </div>
              </div>
          </div>
        </div>
      </main>
    </div>
  );
}
