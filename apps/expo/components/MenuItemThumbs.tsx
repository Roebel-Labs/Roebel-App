import React from 'react';
import ThumbsVote from '@/components/ThumbsVote';
import type { MenuItemVoteSummary } from '@/lib/types';

type Props = {
  summary: MenuItemVoteSummary | null;
  size?: 'sm' | 'md';
  interactive?: boolean;
  userVote?: 1 | -1 | null;
  onVote?: (v: 1 | -1) => void;
};

/**
 * Adapter that derives the thumbs-up count from a menu-item vote summary
 * (which only exposes total vote_count + percent_liked) and delegates to the
 * shared ThumbsVote widget. Only the thumbs-up count is ever displayed.
 */
export default function MenuItemThumbs({ summary, ...rest }: Props) {
  const voteCount = summary?.vote_count ?? 0;
  const percent = summary?.percent_liked ?? null;
  const upCount =
    voteCount > 0 && percent != null ? Math.round(voteCount * (percent / 100)) : null;

  return <ThumbsVote upCount={upCount} {...rest} />;
}
