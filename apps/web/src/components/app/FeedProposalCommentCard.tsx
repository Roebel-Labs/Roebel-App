"use client";

import Image from "next/image";
import Link from "next/link";
import { ProposalPreviewCard } from "@/components/app/ProposalPreviewCard";
import type { ProposalCommentFeedItem } from "@/types/post";

interface FeedProposalCommentCardProps {
  comment: ProposalCommentFeedItem;
}

function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "gerade eben";
  if (diffMin < 60) return `vor ${diffMin} Min.`;
  if (diffHrs < 24) return `vor ${diffHrs} Std.`;
  if (diffDays < 7) return `vor ${diffDays} T.`;
  return date.toLocaleDateString("de-DE", { day: "numeric", month: "short" });
}

export function FeedProposalCommentCard({ comment }: FeedProposalCommentCardProps) {
  const isOrg = !!comment.author_account_name;
  const shortAddress = `${comment.wallet_address.slice(0, 4)}...${comment.wallet_address.slice(-3)}`;
  const displayName = isOrg
    ? comment.author_account_name!
    : (comment.author_username || shortAddress);
  const displayAvatar = isOrg
    ? comment.author_account_avatar_url
    : comment.author_profile_picture_url;

  return (
    <div className="bg-card rounded-lg border border-border p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-sm font-medium text-muted-foreground flex-shrink-0 overflow-hidden">
          {displayAvatar ? (
            <Image
              src={displayAvatar}
              alt=""
              width={40}
              height={40}
              className="object-cover w-full h-full"
            />
          ) : (
            displayName.slice(0, 2).toUpperCase()
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-foreground truncate">
              {displayName}
            </span>
            <span className="text-xs text-muted-foreground">
              · {formatRelativeTime(comment.created_at)}
            </span>
          </div>
          <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            kommentierte einen Vorschlag
          </p>
        </div>
      </div>

      <div className="flex items-start gap-2">
        {comment.emoji && (
          <span className="text-2xl leading-none flex-shrink-0">{comment.emoji}</span>
        )}
        <p className="text-sm text-foreground whitespace-pre-wrap break-words">
          {comment.content}
        </p>
      </div>

      {comment.media_urls.length > 0 && (
        <div className="grid grid-cols-2 gap-1.5">
          {comment.media_urls.slice(0, 4).map((url, i) => (
            <div key={i} className="relative aspect-square rounded-md overflow-hidden bg-muted">
              <Image
                src={url}
                alt=""
                fill
                className="object-cover"
                sizes="(max-width: 640px) 50vw, 220px"
              />
            </div>
          ))}
        </div>
      )}

      {comment.proposal && <ProposalPreviewCard proposal={comment.proposal} />}

      {!comment.proposal && (
        <Link
          href={`/app/proposals/${comment.proposal_id}`}
          className="text-xs text-primary hover:underline"
        >
          Zum Vorschlag →
        </Link>
      )}
    </div>
  );
}
