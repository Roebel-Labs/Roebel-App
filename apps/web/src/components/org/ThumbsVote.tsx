"use client";

import { ThumbsUp, ThumbsDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { VoteValue } from "@/lib/supabase-ratings";

interface ThumbsVoteProps {
  /** Up-count to display. Pass null for interactive-only (no count). */
  upCount: number | null;
  size?: "sm" | "md";
  interactive?: boolean;
  userVote?: VoteValue | null;
  onVote?: (v: VoteValue) => void;
}

export function ThumbsVote({
  upCount,
  size = "md",
  interactive = false,
  userVote = null,
  onVote,
}: ThumbsVoteProps) {
  const iconSize = size === "sm" ? 14 : 18;

  if (!interactive) {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <ThumbsUp size={iconSize} />
        {typeof upCount === "number" && (
          <span className={size === "sm" ? "text-xs" : "text-sm"}>{upCount}</span>
        )}
      </span>
    );
  }

  const pill =
    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors";

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onVote?.(1)}
        className={cn(
          pill,
          userVote === 1
            ? "border-primary bg-primary/10 text-primary"
            : "border-border text-muted-foreground hover:text-foreground"
        )}
        aria-pressed={userVote === 1}
        aria-label="Daumen hoch"
      >
        <ThumbsUp size={iconSize} />
        {typeof upCount === "number" && <span>{upCount}</span>}
      </button>
      <button
        type="button"
        onClick={() => onVote?.(-1)}
        className={cn(
          pill,
          userVote === -1
            ? "border-destructive bg-destructive/10 text-destructive"
            : "border-border text-muted-foreground hover:text-foreground"
        )}
        aria-pressed={userVote === -1}
        aria-label="Daumen runter"
      >
        <ThumbsDown size={iconSize} />
      </button>
    </div>
  );
}
