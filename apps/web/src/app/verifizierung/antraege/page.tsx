"use client";

import { useState } from "react";
import { Header } from "@/components/layout/Header";
import { useActiveAccount } from "thirdweb/react";
import { useVerificationStatus } from "@/hooks/useVerificationStatus";
import { useRequests } from "@/hooks/useRequests";
import { RequestCard } from "@/components/verification/RequestCard";
import Link from "next/link";
import { de } from "@/lib/translations/de";

type FilterType = "all" | "attester" | "citizen";

export default function AllRequestsPage() {
  const account = useActiveAccount();
  const { isAttester, isCitizen, isLoading: statusLoading } = useVerificationStatus();
  const [filter, setFilter] = useState<FilterType>("all");

  // Fetch requests from both contracts
  const {
    requests: attesterRequests,
    isLoading: loadingAttester,
  } = useRequests("attester");

  const {
    requests: citizenRequests,
    isLoading: loadingCitizen,
  } = useRequests("citizen");

  const isLoading = loadingAttester || loadingCitizen || statusLoading;

  // Filter requests based on selected tab
  const getFilteredRequests = () => {
    if (filter === "attester") {
      return { requests: attesterRequests, type: "attester" as const };
    } else if (filter === "citizen") {
      return { requests: citizenRequests, type: "citizen" as const };
    } else {
      // Combine both, mark type for rendering
      return {
        requests: [
          ...attesterRequests.map(r => ({ ...r, contractType: "attester" as const })),
          ...citizenRequests.map(r => ({ ...r, contractType: "citizen" as const })),
        ],
        type: "mixed" as const,
      };
    }
  };

  const { requests: filteredRequests, type: requestType } = getFilteredRequests();

  // Debug logging
  console.log("🔍 [AllRequestsPage] Render state:", {
    attesterRequests: attesterRequests.length,
    citizenRequests: citizenRequests.length,
    filteredRequests: filteredRequests.length,
    loadingAttester,
    loadingCitizen,
    isLoading,
    filter,
  });

  return (
    <div className="min-h-screen bg-muted">
      <Header />

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-8 lg:py-12">
        <div className="max-w-6xl mx-auto">
          <div className="mb-4 sm:mb-6">
            <Link href="/verifizierung" className="text-sm sm:text-base text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              {de.navigation.backToDashboard}
            </Link>
          </div>

          <div className="flex flex-col justify-between items-start gap-2 sm:gap-4 mb-6 sm:mb-8">
            <div>
              <h1 className="text-2xl sm:text-3xl font-medium text-foreground">{de.verification.allRequests}</h1>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">Prüfe und unterschreibe offene Verifizierungs-Anträge</p>
            </div>
          </div>

          {!account ? (
            <div className="bg-card border border-border rounded-xl shadow-sm p-6 sm:p-12 text-center">
              <p className="text-sm sm:text-base text-muted-foreground mb-4">{de.common.connectWallet}</p>
            </div>
          ) : (
            <div className="space-y-4 sm:space-y-6">
              {/* Filter tabs */}
              <div className="bg-card border border-border rounded-xl shadow-sm p-1.5 sm:p-2 flex gap-1.5 sm:gap-2 overflow-x-auto">
                <button
                  onClick={() => setFilter("all")}
                  className={`flex-1 min-w-[90px] px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                    filter === "all"
                      ? "bg-black text-white"
                      : "text-muted-foreground hover:bg-accent"
                  }`}
                >
                  Alle ({attesterRequests.length + citizenRequests.length})
                </button>
                <button
                  onClick={() => setFilter("attester")}
                  className={`flex-1 min-w-[90px] px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                    filter === "attester"
                      ? "bg-black text-white"
                      : "text-muted-foreground hover:bg-accent"
                  }`}
                >
                  Bescheiniger ({attesterRequests.length})
                </button>
                <button
                  onClick={() => setFilter("citizen")}
                  className={`flex-1 min-w-[90px] px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                    filter === "citizen"
                      ? "bg-black text-white"
                      : "text-muted-foreground hover:bg-accent"
                  }`}
                >
                  Bürger ({citizenRequests.length})
                </button>
              </div>

              {/* Permissions info */}
              {!isAttester && !isCitizen && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 sm:p-6">
                  <p className="text-xs sm:text-sm text-yellow-800">
                    Du benötigst ein Bescheiniger- oder Bürger-NFT, um Anträge zu unterschreiben.
                  </p>
                </div>
              )}

              {/* Requests list */}
              <div className="bg-card border border-border rounded-xl shadow-sm p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-4 mb-4 sm:mb-6">
                  <h2 className="text-lg sm:text-xl font-medium text-foreground">
                    {filter === "all" && "Alle Anträge"}
                    {filter === "attester" && "Bescheiniger-Anträge"}
                    {filter === "citizen" && "Bürger-Anträge"}
                  </h2>
                  <span className="text-xs sm:text-sm text-muted-foreground bg-muted px-2.5 sm:px-3 py-1 rounded-full whitespace-nowrap">
                    Total: {filteredRequests.length}
                  </span>
                </div>

                {isLoading ? (
                  <div className="text-center py-8 sm:py-12">
                    <div className="inline-block w-6 h-6 sm:w-8 sm:h-8 border-4 border-black border-t-transparent rounded-full animate-spin mb-3 sm:mb-4" />
                    <p className="text-sm sm:text-base text-muted-foreground">{de.common.loading}</p>
                  </div>
                ) : filteredRequests.length > 0 ? (
                  <div className="space-y-3 sm:space-y-4">
                    {filteredRequests.map((request: any) => {
                      const contractType = request.contractType || requestType;

                      return (
                        <RequestCard
                          key={`${contractType}-${request.id}`}
                          requestId={request.id}
                          target={request.target}
                          type={request.requestType === 0 ? "Attestation" : "Revocation"}
                          status={
                            request.status === 0
                              ? "Pending"
                              : request.status === 1
                              ? "Approved"
                              : request.status === 2
                              ? "Rejected"
                              : "Executed"
                          }
                          contractType={contractType}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 sm:py-12">
                    <p className="text-sm sm:text-base text-muted-foreground mb-4">
                      {filter === "all" && "Keine Anträge vorhanden"}
                      {filter === "attester" && de.verification.noAttesterRequests}
                      {filter === "citizen" && de.verification.noCitizenRequests}
                    </p>
                    {!isAttester && !isCitizen && (
                      <div className="space-y-3 mt-6">
                        <p className="text-xs sm:text-sm text-muted-foreground">{de.verification.beFirstToApply}</p>
                        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 justify-center">
                          <Link
                            href="/verifizierung/buerger-beantragen"
                            className="inline-flex items-center justify-center bg-black hover:bg-foreground/90 text-white px-4 sm:px-6 py-2.5 sm:py-3 rounded-lg transition-colors text-sm sm:text-base font-medium"
                          >
                            Bürger-NFT beantragen
                          </Link>
                          <Link
                            href="/verifizierung/bescheiniger-beantragen"
                            className="inline-flex items-center justify-center bg-card hover:bg-accent border border-border text-foreground px-4 sm:px-6 py-2.5 sm:py-3 rounded-lg transition-colors text-sm sm:text-base font-medium"
                          >
                            Bescheiniger-NFT beantragen
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Info box */}
              <div className="bg-muted border border-border rounded-xl shadow-sm p-4 sm:p-6">
                <h3 className="text-base sm:text-lg font-medium mb-3 sm:mb-4 text-foreground">
                  So funktioniert die Unterschrift
                </h3>
                <div className="space-y-2.5 sm:space-y-3 text-foreground text-xs sm:text-sm">
                  <div className="flex items-start gap-2 sm:gap-3">
                    <span className="font-medium flex-shrink-0">1.</span>
                    <span>Prüfe den Antrag und die eingereichten Nachweise</span>
                  </div>
                  <div className="flex items-start gap-2 sm:gap-3">
                    <span className="font-medium flex-shrink-0">2.</span>
                    <span>Klicke auf &ldquo;Genehmigen&rdquo; wenn der Antrag berechtigt ist</span>
                  </div>
                  <div className="flex items-start gap-2 sm:gap-3">
                    <span className="font-medium flex-shrink-0">3.</span>
                    <span>Bei ausreichend Unterschriften wird das NFT automatisch vergeben</span>
                  </div>
                  <div className="flex items-start gap-2 sm:gap-3">
                    <span className="font-medium flex-shrink-0">4.</span>
                    <span>Du kannst Anträge auch ablehnen, wenn sie nicht berechtigt sind</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
