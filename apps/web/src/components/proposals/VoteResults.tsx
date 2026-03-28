"use client";

import { formatVotes } from "@/lib/proposal-types";
import { useEffect, useState } from "react";

interface VoteResultsProps {
  forVotes: string;
  againstVotes: string;
  abstainVotes: string;
}

export function VoteResults({ forVotes, againstVotes, abstainVotes }: VoteResultsProps) {
  const [animated, setAnimated] = useState(false);

  // Convert to BigInt for calculations
  const forVotesBig = BigInt(forVotes);
  const againstVotesBig = BigInt(againstVotes);
  const abstainVotesBig = BigInt(abstainVotes);
  const totalVotes = forVotesBig + againstVotesBig + abstainVotesBig;

  // Calculate percentages
  const getPercentage = (votes: bigint) => {
    if (totalVotes === 0n) return 0;
    return Number((votes * 100n) / totalVotes);
  };

  const forPercentage = getPercentage(forVotesBig);
  const againstPercentage = getPercentage(againstVotesBig);
  const abstainPercentage = getPercentage(abstainVotesBig);

  // Trigger animation on mount
  useEffect(() => {
    setTimeout(() => setAnimated(true), 100);
  }, []);

  // Determine winning option
  const getWinningOption = () => {
    if (forVotesBig > againstVotesBig && forVotesBig > abstainVotesBig) return "for";
    if (againstVotesBig > forVotesBig && againstVotesBig > abstainVotesBig) return "against";
    if (abstainVotesBig > forVotesBig && abstainVotesBig > againstVotesBig) return "abstain";
    return null;
  };

  const winningOption = getWinningOption();

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-medium text-foreground">Vote Results</h2>
        {totalVotes > 0n && (
          <span className="text-sm text-muted-foreground">
            {formatVotes(totalVotes)} total
          </span>
        )}
      </div>

      {totalVotes === 0n ? (
        <div className="text-center py-6">
          <p className="text-muted-foreground mb-2">No votes with weight yet</p>
          <p className="text-xs text-muted-foreground">
            Votes may have been cast but with zero voting power.<br />
            Make sure you delegated before the proposal was created!
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <VoteBar
            label="For"
            votes={forVotes}
            percentage={forPercentage}
            color="green"
            animated={animated}
            isWinning={winningOption === "for"}
          />

          <VoteBar
            label="Against"
            votes={againstVotes}
            percentage={againstPercentage}
            color="red"
            animated={animated}
            isWinning={winningOption === "against"}
          />

          <VoteBar
            label="Abstain"
            votes={abstainVotes}
            percentage={abstainPercentage}
            color="gray"
            animated={animated}
            isWinning={winningOption === "abstain"}
          />
        </div>
      )}
    </div>
  );
}

interface VoteBarProps {
  label: string;
  votes: string;
  percentage: number;
  color: "green" | "red" | "gray";
  animated: boolean;
  isWinning: boolean;
}

function VoteBar({ label, votes, percentage, color, animated, isWinning }: VoteBarProps) {
  const colorClasses = {
    green: {
      bg: "bg-green-600",
      text: "text-green-700",
      barBg: "bg-green-100",
    },
    red: {
      bg: "bg-red-600",
      text: "text-red-700",
      barBg: "bg-red-100",
    },
    gray: {
      bg: "bg-gray-600",
      text: "text-foreground",
      barBg: "bg-muted",
    },
  };

  const colors = colorClasses[color];

  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-2">
        <span className={`font-medium ${colors.text}`}>{label}</span>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground">{percentage.toFixed(1)}%</span>
          <span className={`font-mono text-foreground font-medium`}>
            {formatVotes(votes)}
          </span>
        </div>
      </div>
      <div className={`relative w-full ${colors.barBg} rounded-full h-2 overflow-hidden`}>
        <div
          className={`h-full ${colors.bg} transition-all duration-700 ease-out rounded-full`}
          style={{
            width: animated ? `${percentage}%` : "0%",
          }}
        />
      </div>
    </div>
  );
}
