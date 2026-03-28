"use client";

import { useState, useEffect, useTransition } from "react";
import { Check, Clock, Timer } from "lucide-react";
import { votePoll } from "@/app/actions/posts";
import { toast } from "sonner";
import type { PollWithResults } from "@/types/post";

interface PollDisplayProps {
  poll: PollWithResults;
  walletAddress?: string;
  isVerified: boolean;
  onVoted?: () => void;
}

function formatTimeRemaining(expiresAt: string): string {
  const now = new Date();
  const expires = new Date(expiresAt);
  const diffMs = expires.getTime() - now.getTime();

  if (diffMs <= 0) return "Abgelaufen";

  const diffHrs = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays >= 1) return `Noch ${diffDays} ${diffDays === 1 ? "Tag" : "Tage"}`;
  if (diffHrs >= 1) return `Noch ${diffHrs} ${diffHrs === 1 ? "Stunde" : "Stunden"}`;
  const diffMin = Math.floor(diffMs / 60000);
  return `Noch ${diffMin} Min.`;
}

export function PollDisplay({
  poll,
  walletAddress,
  isVerified,
  onVoted,
}: PollDisplayProps) {
  const [selected, setSelected] = useState<number[]>([]);
  const [animated, setAnimated] = useState(false);
  const [localPoll, setLocalPoll] = useState(poll);
  const [isPending, startTransition] = useTransition();

  const hasVoted = localPoll.viewer_vote !== null;
  const canVote = !!walletAddress && isVerified && !hasVoted && !localPoll.is_expired;

  useEffect(() => {
    setTimeout(() => setAnimated(true), 100);
  }, []);

  // Sync with parent prop changes
  useEffect(() => {
    setLocalPoll(poll);
  }, [poll]);

  const toggleOption = (index: number) => {
    if (!canVote) return;

    if (localPoll.poll_type === "single") {
      setSelected([index]);
    } else {
      setSelected((prev) =>
        prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
      );
    }
  };

  const handleVote = () => {
    if (!walletAddress || selected.length === 0 || isPending) return;

    // Optimistic update
    const newVoteCounts = [...localPoll.vote_counts];
    for (const idx of selected) {
      newVoteCounts[idx]++;
    }
    const prevPoll = localPoll;
    setLocalPoll({
      ...localPoll,
      total_votes: localPoll.total_votes + 1,
      vote_counts: newVoteCounts,
      viewer_vote: selected,
    });

    startTransition(async () => {
      const result = await votePoll(localPoll.id, walletAddress, selected);
      if (!result.success) {
        // Rollback
        setLocalPoll(prevPoll);
        toast.error(result.error || "Fehler bei der Abstimmung");
      } else {
        setSelected([]);
        onVoted?.();
      }
    });
  };

  const getPercentage = (count: number) => {
    if (localPoll.total_votes === 0) return 0;
    return Math.round((count / localPoll.total_votes) * 100);
  };

  return (
    <div className="mx-4 mb-3 rounded-lg border border-border p-3 space-y-2">
      {/* Header badge */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
          {localPoll.poll_type === "single" ? "Einzelauswahl" : "Mehrfachauswahl"}
        </span>
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          {localPoll.is_expired ? (
            <>
              <Clock className="h-3 w-3" />
              Abgelaufen
            </>
          ) : (
            <>
              <Timer className="h-3 w-3" />
              {formatTimeRemaining(localPoll.expires_at)}
            </>
          )}
        </span>
      </div>

      {/* Options */}
      <div className="space-y-1.5">
        {localPoll.options.map((option, i) => {
          const count = localPoll.vote_counts[i] || 0;
          const percentage = getPercentage(count);
          const isSelected = canVote
            ? selected.includes(i)
            : localPoll.viewer_vote?.includes(i) ?? false;

          return (
            <button
              key={i}
              type="button"
              onClick={() => toggleOption(i)}
              disabled={!canVote}
              className={`relative w-full text-left rounded-md border transition-colors overflow-hidden ${
                canVote
                  ? isSelected
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                  : "border-border cursor-default"
              }`}
            >
              {/* Background bar */}
              <div
                className={`absolute inset-0 transition-all duration-700 ease-out ${
                  isSelected ? "bg-primary/10" : "bg-muted/50"
                }`}
                style={{ width: animated ? `${percentage}%` : "0%" }}
              />

              <div className="relative flex items-center gap-2 px-3 py-2">
                {/* Selection indicator */}
                {canVote && (
                  <div
                    className={`flex-shrink-0 w-4 h-4 border-2 flex items-center justify-center ${
                      localPoll.poll_type === "single" ? "rounded-full" : "rounded-sm"
                    } ${
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/40"
                    }`}
                  >
                    {isSelected && <Check className="h-2.5 w-2.5" />}
                  </div>
                )}

                {/* Voted indicator */}
                {!canVote && isSelected && (
                  <div className="flex-shrink-0 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                    <Check className="h-2.5 w-2.5 text-primary-foreground" />
                  </div>
                )}

                <span className="flex-1 text-sm text-foreground truncate">
                  {option}
                </span>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs text-muted-foreground">
                    {percentage}%
                  </span>
                  <span className="text-xs text-muted-foreground font-mono w-6 text-right">
                    {count}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Vote button + total */}
      <div className="flex items-center justify-between pt-1">
        <span className="text-xs text-muted-foreground">
          {localPoll.total_votes}{" "}
          {localPoll.total_votes === 1 ? "Stimme" : "Stimmen"}
        </span>
        {canVote && (
          <button
            type="button"
            onClick={handleVote}
            disabled={selected.length === 0 || isPending}
            className="px-3 py-1 bg-primary text-primary-foreground rounded-full text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Abstimmen
          </button>
        )}
      </div>
    </div>
  );
}
