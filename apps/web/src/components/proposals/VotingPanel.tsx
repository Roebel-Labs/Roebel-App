"use client";

import { useState } from "react";
import Link from "next/link";
import { de } from "@/lib/translations/de";

interface VotingPanelProps {
  canVote: boolean;
  hasVoted: boolean;
  hasNFT: boolean;
  votingPower: bigint | undefined;
  isPending: boolean;
  isVoting: boolean;
  proposalState: number | undefined;
  userAddress: string | undefined;
  onVote: (voteType: 0 | 1 | 2) => void; // 0 = Against, 1 = For, 2 = Abstain
}

export function VotingPanel({
  canVote,
  hasVoted,
  hasNFT,
  votingPower,
  isPending,
  isVoting,
  proposalState,
  userAddress,
  onVote,
}: VotingPanelProps) {
  const [selectedVote, setSelectedVote] = useState<0 | 1 | 2 | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const handleVoteClick = (voteType: 0 | 1 | 2) => {
    setSelectedVote(voteType);
    setShowConfirmation(true);
  };

  const confirmVote = () => {
    if (selectedVote !== null) {
      onVote(selectedVote);
      setShowConfirmation(false);
    }
  };

  const cancelVote = () => {
    setSelectedVote(null);
    setShowConfirmation(false);
  };

  const getVoteLabel = (voteType: number) => {
    switch (voteType) {
      case 0:
        return de.proposals.voteAgainst;
      case 1:
        return de.proposals.voteFor;
      case 2:
        return de.proposals.voteAbstain;
      default:
        return "Unbekannt";
    }
  };

  // Loading state - blockchain data not ready
  if (proposalState === undefined) {
    return (
      <div className="bg-card border border-border rounded-lg p-6">
        <p className="text-muted-foreground mb-3">Lade Abstimmungsstatus von der Blockchain...</p>
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-muted rounded w-1/2" />
          <div className="h-10 bg-muted rounded" />
        </div>
      </div>
    );
  }

  // VOTING IS ACTIVE (State 0 = Pending, State 1 = Active)
  if (proposalState === 0 || proposalState === 1) {
    // User already voted
    if (hasVoted) {
      return (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <p className="text-green-800">Du hast bereits abgestimmt.</p>
        </div>
      );
    }

    // User doesn't have NFT but voting is active
    if (!hasNFT) {
      return (
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="text-lg font-medium text-foreground mb-2">Abstimmung läuft</h3>
          <p className="text-muted-foreground mb-4">
            Du benötigst einen Bürger-Pass, um an der Governance teilzunehmen.
          </p>
          <div className="flex gap-3">
            <Link
              href="/verifizierung/buerger-beantragen"
              className="inline-flex items-center gap-2 bg-black hover:bg-foreground/90 text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium"
            >
              Bürger-Pass beantragen
            </Link>
          </div>
        </div>
      );
    }

    // User can vote - show voting interface
    if (hasNFT && !hasVoted) {
    return (
      <>
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="text-lg font-medium text-foreground mb-4">{de.proposals.vote}</h3>

          {/* Voting Power Display */}
          <div className="text-sm text-muted-foreground mb-4">
            {de.proposals.votingPower}: <span className="text-foreground font-medium">{votingPower?.toString() || "0"}</span>
          </div>

          {/* Vote Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 mb-4">
            <button
              onClick={() => handleVoteClick(1)}
              disabled={isPending || isVoting}
              className="bg-green-600 hover:bg-green-700 disabled:bg-muted disabled:cursor-not-allowed text-white disabled:text-muted-foreground font-medium py-3 px-4 rounded-lg transition-colors"
            >
              <div className="text-sm">{de.proposals.voteFor}</div>
            </button>

            <button
              onClick={() => handleVoteClick(0)}
              disabled={isPending || isVoting}
              className="bg-red-600 hover:bg-red-700 disabled:bg-muted disabled:cursor-not-allowed text-white disabled:text-muted-foreground font-medium py-3 px-4 rounded-lg transition-colors"
            >
              <div className="text-sm">{de.proposals.voteAgainst}</div>
            </button>

            <button
              onClick={() => handleVoteClick(2)}
              disabled={isPending || isVoting}
              className="bg-gray-600 hover:bg-gray-700 disabled:bg-muted disabled:cursor-not-allowed text-white disabled:text-muted-foreground font-medium py-3 px-4 rounded-lg transition-colors"
            >
              <div className="text-sm">{de.proposals.voteAbstain}</div>
            </button>
          </div>

          {(isPending || isVoting) && (
            <div className="flex items-center gap-3 p-3 bg-muted border border-border rounded-lg">
              <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-foreground">{de.proposals.castingVote}</span>
            </div>
          )}

          {/* Helper Text */}
          <p className="text-xs text-muted-foreground mt-4">
            Deine Stimme wird on-chain gespeichert und kann nicht geändert werden
          </p>
        </div>

        {/* Confirmation Modal */}
        {showConfirmation && selectedVote !== null && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-card border border-border rounded-lg p-4 sm:p-6 max-w-md w-full shadow-xl">
              <h3 className="text-lg font-medium text-foreground mb-4">Stimme bestätigen</h3>
              <p className="text-foreground mb-6">
                Du stimmst <span className="font-medium text-foreground">{getVoteLabel(selectedVote)}</span> für diesen Vorschlag.
                Diese Aktion kann nicht rückgängig gemacht werden.
              </p>
              <div className="bg-muted border border-border rounded-lg p-3 mb-6">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{de.proposals.votingPower}:</span>
                  <span className="text-foreground font-medium">{votingPower?.toString() || "0"}</span>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={cancelVote}
                  className="flex-1 bg-card hover:bg-accent border border-border text-foreground py-2 px-4 rounded-lg transition-colors font-medium"
                >
                  {de.common.cancel}
                </button>
                <button
                  onClick={confirmVote}
                  className="flex-1 bg-black hover:bg-foreground/90 text-white py-2 px-4 rounded-lg transition-colors font-medium"
                >
                  Stimme abgeben
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
    }
  }

  // VOTING NOT ACTIVE - Show state-based messages
  const getStateMessage = () => {
    // ProposalState enum: 2=Canceled, 3=Defeated, 4=Succeeded, 5=Queued, 6=Expired, 7=Executed
    switch (proposalState) {
      case 2: // Canceled
        return "Dieser Vorschlag wurde abgebrochen.";
      case 3: // Defeated
        return "Abstimmung beendet. Dieser Vorschlag wurde abgelehnt.";
      case 4: // Succeeded
        return "Abstimmung beendet. Dieser Vorschlag wurde angenommen.";
      case 5: // Queued
        return "Abstimmung abgeschlossen. Vorschlag ist in Warteschlange zur Ausführung.";
      case 6: // Expired
        return "Dieser Vorschlag ist abgelaufen.";
      case 7: // Executed
        return "Abstimmung abgeschlossen. Dieser Vorschlag wurde ausgeführt.";
      default:
        return "Abstimmung ist derzeit nicht aktiv für diesen Vorschlag.";
    }
  };

  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <p className="text-muted-foreground">{getStateMessage()}</p>
    </div>
  );
}
