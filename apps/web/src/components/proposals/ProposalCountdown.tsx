"use client";

import { useState, useEffect } from "react";

interface ProposalCountdownProps {
  targetBlock: bigint;
  currentBlock: bigint;
  label: string;
  isPending?: boolean; // Pending = countdown to start, Active = countdown to end
}

const BASE_BLOCK_TIME = 2; // 2 seconds per block on Base

export function ProposalCountdown({
  targetBlock,
  currentBlock,
  label,
  isPending = false,
}: ProposalCountdownProps) {
  const [timeRemaining, setTimeRemaining] = useState<string>("");
  const [blocksRemaining, setBlocksRemaining] = useState<bigint>(BigInt(0));
  const [progressPercentage, setProgressPercentage] = useState<number>(0);

  useEffect(() => {
    const calculateTimeRemaining = () => {
      const blockDiff = targetBlock - currentBlock;
      setBlocksRemaining(blockDiff);

      if (blockDiff <= 0n) {
        setTimeRemaining(isPending ? "Voting has started" : "Voting has ended");
        setProgressPercentage(100);
        return;
      }

      // Calculate time in seconds
      const secondsRemaining = Number(blockDiff) * BASE_BLOCK_TIME;

      // Convert to human-readable format
      const days = Math.floor(secondsRemaining / 86400);
      const hours = Math.floor((secondsRemaining % 86400) / 3600);
      const minutes = Math.floor((secondsRemaining % 3600) / 60);
      const seconds = secondsRemaining % 60;

      let timeString = "";
      if (days > 0) {
        timeString += `${days}d `;
      }
      if (hours > 0 || days > 0) {
        timeString += `${hours}h `;
      }
      if (minutes > 0 || hours > 0 || days > 0) {
        timeString += `${minutes}m `;
      }
      if (days === 0 && hours === 0) {
        timeString += `${seconds}s`;
      }

      setTimeRemaining(timeString.trim());

      // Calculate progress (for pending phase, progress goes up as we approach start)
      // For active phase, progress goes up as we approach end
      // We need to know the total duration to calculate progress accurately
      // For now, just show blocks remaining
    };

    calculateTimeRemaining();

    // Update every second
    const interval = setInterval(calculateTimeRemaining, 1000);

    return () => clearInterval(interval);
  }, [targetBlock, currentBlock, isPending]);

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-1">{label}</h3>
          <p className="text-2xl font-medium text-foreground">{timeRemaining}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {blocksRemaining > 0n ? `~${blocksRemaining.toString()} blocks remaining` : "Complete"}
          </p>
        </div>
        <div className={`text-4xl ${isPending ? "opacity-50" : ""}`}>
          {isPending ? "⏳" : "🗳️"}
        </div>
      </div>

      {/* Progress Bar */}
      {blocksRemaining > 0n && (
        <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
          <div
            className={`h-full transition-all duration-1000 ${
              isPending ? "bg-yellow-500" : "bg-green-500"
            }`}
            style={{ width: `${Math.min(progressPercentage, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}
