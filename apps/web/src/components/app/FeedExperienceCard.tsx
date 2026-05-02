"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActiveAccount } from "thirdweb/react";
import { MessageCircle, Share2, Sparkles } from "lucide-react";
import { LikeButton } from "@/components/app/LikeButton";
import type { PostWithEngagement } from "@/types/post";
import { toast } from "sonner";

interface FeedExperienceCardProps {
  post: PostWithEngagement;
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

export function FeedExperienceCard({ post }: FeedExperienceCardProps) {
  const router = useRouter();
  const account = useActiveAccount();

  const shortAddress = `${post.wallet_address.slice(0, 4)}...${post.wallet_address.slice(-3)}`;
  const displayName = post.author_username || shortAddress;
  const displayAvatar = post.author_profile_picture_url;

  const eventId = post.linked_event_id;
  const experienceId = post.linked_experience_id;
  const linkHref =
    eventId && experienceId
      ? `/app/events/${eventId}?experienceId=${experienceId}`
      : eventId
        ? `/app/events/${eventId}`
        : null;

  const eventTitle = post.linked_event?.title;
  const eventBanner = post.linked_event?.image_url || null;
  const firstMedia = post.media_urls?.[0] || null;

  const handleCardClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.closest(
        'button, a, input, video, [role="button"], [data-radix-collection-item]'
      )
    )
      return;
    if (linkHref) router.push(linkHref);
  };

  const handleShare = async () => {
    if (!linkHref) return;
    const url = `${window.location.origin}${linkHref}`;
    try {
      if (navigator.share) {
        await navigator.share({ url, title: eventTitle || "Erlebnis" });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Link kopiert");
      }
    } catch {
      // user cancelled
    }
  };

  return (
    <div
      onClick={handleCardClick}
      className="rounded-lg border border-border bg-card p-4 hover:bg-accent/40 transition-colors cursor-pointer space-y-2"
    >
      {/* Author row */}
      <div className="flex items-center gap-2.5">
        <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden">
          {displayAvatar ? (
            <Image
              src={displayAvatar}
              alt=""
              width={28}
              height={28}
              className="object-cover w-full h-full"
            />
          ) : (
            <span className="text-xs font-medium text-muted-foreground">
              {displayName.slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm font-medium text-foreground truncate">
            {displayName}
          </span>
          <span className="text-xs text-muted-foreground">
            · {formatRelativeTime(post.created_at)}
          </span>
        </div>
        <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
          <Sparkles className="h-3 w-3" />
          Erlebnis
        </span>
      </div>

      {/* Event reference */}
      {eventTitle && eventId && (
        <div className="text-xs text-muted-foreground truncate">
          war bei:{" "}
          <Link
            href={`/app/events/${eventId}`}
            className="text-primary font-medium hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {eventTitle}
          </Link>
        </div>
      )}

      {/* Content snippet */}
      {post.content && post.content.trim() && (
        <p className="text-sm text-foreground line-clamp-2 whitespace-pre-wrap">
          {post.content}
        </p>
      )}

      {/* Thumbnails: event banner + first media */}
      {(eventBanner || firstMedia) && (
        <div className="flex gap-2 pt-1">
          {eventBanner && (
            <div className="relative h-16 w-16 rounded-lg overflow-hidden bg-muted flex-shrink-0">
              <Image
                src={eventBanner}
                alt=""
                fill
                sizes="64px"
                className="object-cover"
              />
            </div>
          )}
          {firstMedia && (
            <div className="relative h-16 w-16 rounded-lg overflow-hidden bg-muted flex-shrink-0">
              <Image
                src={firstMedia}
                alt=""
                fill
                sizes="64px"
                className="object-cover"
              />
            </div>
          )}
        </div>
      )}

      {/* Footer actions */}
      <div className="flex items-center gap-1 pt-1 -ml-3">
        <LikeButton
          postId={post.id}
          isLiked={post.is_liked_by_viewer}
          likesCount={post.likes_count}
          walletAddress={account?.address}
        />
        {linkHref && (
          <Link
            href={linkHref}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Erlebnis ansehen"
          >
            <MessageCircle className="h-4 w-4" />
            {post.comments_count > 0 && <span>{post.comments_count}</span>}
          </Link>
        )}
        <button
          type="button"
          onClick={handleShare}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label="Teilen"
        >
          <Share2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
