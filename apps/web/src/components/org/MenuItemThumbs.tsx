"use client";

import { ThumbsVote } from "./ThumbsVote";
import type { MenuItemVoteSummary, VoteValue } from "@/lib/supabase-ratings";

interface MenuItemThumbsProps {
  summary: MenuItemVoteSummary | null;
  size?: "sm" | "md";
  interactive?: boolean;
  userVote?: VoteValue | null;
  onVote?: (v: VoteValue) => void;
}

/** Derives an approximate up-count from vote_count * percent_liked. */
function upCountFrom(summary: MenuItemVoteSummary | null): number | null {
  if (!summary || summary.vote_count <= 0) return null;
  return Math.round((summary.vote_count * summary.percent_liked) / 100);
}

export function MenuItemThumbs({
  summary,
  size = "sm",
  interactive = false,
  userVote = null,
  onVote,
}: MenuItemThumbsProps) {
  const up = upCountFrom(summary);
  if (!interactive && up === null) return null;
  return (
    <ThumbsVote
      upCount={up}
      size={size}
      interactive={interactive}
      userVote={userVote}
      onVote={onVote}
    />
  );
}
