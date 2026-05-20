"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActiveAccount } from "thirdweb/react";
import {
  Gem,
  Heart,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Send,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { reportPost, toggleLike } from "@/app/actions/posts";
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
  if (diffDays === 1) return "Gestern";
  if (diffDays < 7) return `vor ${diffDays} T.`;
  return date.toLocaleDateString("de-DE", { day: "numeric", month: "short" });
}

function formatEventDate(dateStr: string): { dayMonth: string; weekday: string } {
  const date = new Date(dateStr);
  return {
    dayMonth: date.toLocaleDateString("de-DE", { day: "numeric", month: "long" }),
    weekday: date.toLocaleDateString("de-DE", { weekday: "long" }),
  };
}

export function FeedExperienceCard({ post }: FeedExperienceCardProps) {
  const router = useRouter();
  const account = useActiveAccount();

  const [isLiked, setIsLiked] = useState(post.is_liked_by_viewer);
  const [likesCount, setLikesCount] = useState(post.likes_count);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isReported, setIsReported] = useState(post.is_reported_by_viewer);
  const [, startLikeTransition] = useTransition();
  const [, startReportTransition] = useTransition();

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

  const linkedEvent = post.linked_event;
  const eventBanner = linkedEvent?.image_url || post.media_urls?.[0] || null;
  const eventDate = linkedEvent ? formatEventDate(linkedEvent.date) : null;
  const isFree =
    linkedEvent != null &&
    (linkedEvent.ticket_price === null || linkedEvent.ticket_price <= 0);
  const priceLabel = linkedEvent
    ? isFree
      ? "Kostenlos"
      : `${linkedEvent.ticket_price} €`
    : null;

  const handleCardClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.closest(
        'button, a, input, video, [role="button"], [role="menuitem"], [data-radix-collection-item]'
      )
    )
      return;
    if (linkHref) router.push(linkHref);
  };

  const handleLike = () => {
    if (!account?.address) return;
    const newLiked = !isLiked;
    setIsLiked(newLiked);
    setLikesCount((c) => (newLiked ? c + 1 : Math.max(c - 1, 0)));
    if (newLiked) {
      setIsAnimating(true);
      setTimeout(() => setIsAnimating(false), 300);
    }
    startLikeTransition(async () => {
      const result = await toggleLike(post.id, account.address);
      if (result.success && result.data) {
        setIsLiked(result.data.liked);
        setLikesCount(result.data.newCount);
      } else {
        setIsLiked(!newLiked);
        setLikesCount((c) => (newLiked ? c - 1 : c + 1));
      }
    });
  };

  const handleShare = async () => {
    if (!linkHref) return;
    const url = `${window.location.origin}${linkHref}`;
    try {
      if (navigator.share) {
        await navigator.share({ url, title: linkedEvent?.title || "Erlebnis" });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Link kopiert");
      }
    } catch {
      // user cancelled
    }
  };

  const handleReport = () => {
    if (!account?.address || isReported) return;
    startReportTransition(async () => {
      const result = await reportPost(post.id, account.address);
      if (result.success) {
        setIsReported(true);
        toast.success("Beitrag wurde gemeldet");
      } else {
        toast.error(result.error || "Fehler beim Melden");
      }
    });
  };

  const handleCopyLink = async () => {
    if (!linkHref) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${linkHref}`);
      toast.success("Link kopiert");
    } catch {
      toast.error("Konnte Link nicht kopieren");
    }
  };

  return (
    <article
      onClick={handleCardClick}
      className="rounded-2xl border border-border bg-card p-4 sm:p-5 transition-colors cursor-pointer hover:bg-accent/30"
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="h-11 w-11 rounded-full bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden">
          {displayAvatar ? (
            <Image
              src={displayAvatar}
              alt=""
              width={44}
              height={44}
              className="object-cover w-full h-full"
            />
          ) : (
            <span className="text-sm font-medium text-muted-foreground">
              {displayName.slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0 leading-tight">
          <div className="font-semibold text-foreground truncate">
            {displayName}
          </div>
          <div className="text-sm text-muted-foreground">
            {formatRelativeTime(post.created_at)}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Mehr Optionen"
              className="-mr-1 -mt-1 p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <MoreHorizontal className="h-5 w-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {linkHref && (
              <DropdownMenuItem onClick={handleCopyLink}>
                Link kopieren
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={handleReport}
              disabled={!account?.address || isReported}
              className="text-orange-600 focus:text-orange-600"
            >
              {isReported ? "Bereits gemeldet" : "Beitrag melden"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Post content */}
      {post.content && post.content.trim() && (
        <p className="mt-3 text-sm text-foreground whitespace-pre-wrap break-words">
          {post.content}
        </p>
      )}

      {/* Inset event card */}
      {linkedEvent && eventId && eventDate && (
        <Link
          href={linkHref || `/app/events/${eventId}`}
          onClick={(e) => e.stopPropagation()}
          className="mt-4 flex items-stretch gap-3 rounded-2xl border border-border bg-background p-2 hover:bg-accent/40 transition-colors"
        >
          <div className="relative h-20 w-20 sm:h-24 sm:w-24 rounded-xl overflow-hidden bg-muted flex-shrink-0">
            {eventBanner ? (
              <Image
                src={eventBanner}
                alt=""
                fill
                sizes="96px"
                className="object-cover"
              />
            ) : null}
          </div>
          <div className="min-w-0 flex-1 flex flex-col justify-center py-1 pr-2 gap-1">
            <div className="text-xs text-muted-foreground">
              {eventDate.dayMonth} · {eventDate.weekday}
            </div>
            <div className="font-medium text-foreground truncate">
              {linkedEvent.title}
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground pt-0.5">
              {priceLabel && (
                <span className="inline-flex items-center gap-1.5 min-w-0">
                  <Gem className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">{priceLabel}</span>
                </span>
              )}
              {linkedEvent.location && (
                <span className="inline-flex items-center gap-1.5 min-w-0">
                  <MapPin className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">{linkedEvent.location}</span>
                </span>
              )}
            </div>
          </div>
        </Link>
      )}

      {/* Action row */}
      <div className="mt-4 flex items-center gap-2">
        {linkHref ? (
          <Link
            href={linkHref}
            onClick={(e) => e.stopPropagation()}
            aria-label="Kommentare ansehen"
            className="inline-flex items-center gap-1.5 p-2 -ml-2 rounded-full text-foreground hover:bg-muted transition-colors"
          >
            <MessageCircle className="h-6 w-6" strokeWidth={1.75} />
            {post.comments_count > 0 && (
              <span className="text-sm">{post.comments_count}</span>
            )}
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1.5 p-2 -ml-2 text-muted-foreground">
            <MessageCircle className="h-6 w-6" strokeWidth={1.75} />
          </span>
        )}
        <button
          type="button"
          onClick={handleShare}
          aria-label="Teilen"
          className="p-2 rounded-full text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          disabled={!linkHref}
        >
          <Send className="h-6 w-6" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          onClick={handleLike}
          disabled={!account?.address}
          aria-label={isLiked ? "Gefällt mir nicht mehr" : "Gefällt mir"}
          className={`ml-auto inline-flex items-center gap-1.5 p-2 -mr-2 rounded-full transition-colors ${
            isLiked
              ? "text-red-500"
              : "text-foreground hover:bg-muted"
          } ${!account?.address ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          {likesCount > 0 && (
            <span className="text-sm">{likesCount}</span>
          )}
          <Heart
            className={`h-6 w-6 transition-transform ${isAnimating ? "scale-125" : "scale-100"}`}
            strokeWidth={1.75}
            fill={isLiked ? "currentColor" : "none"}
          />
        </button>
      </div>
    </article>
  );
}
