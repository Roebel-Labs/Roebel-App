"use client"

import { cn } from "@/lib/utils"
import {
  Calendar,
  Newspaper,
  Megaphone,
  ChevronRight,
  Store,
  ShoppingBag,
  MessageCircle,
  Vote,
  Tag,
} from "lucide-react"
import type { UnifiedNotification } from "@/types/app-notifications"

interface NotificationCardProps {
  notification: UnifiedNotification
  isUnread: boolean
  onClick?: () => void
}

function getNotificationIcon(type: string) {
  switch (type) {
    // Push notification types
    case "category":
      return <Calendar className="h-5 w-5 text-primary" />
    case "news":
      return <Newspaper className="h-5 w-5 text-purple-600" />
    // Activity notification types
    case "event_new":
      return <Calendar className="h-5 w-5 text-blue-600" />
    case "news_new":
      return <Newspaper className="h-5 w-5 text-purple-600" />
    case "business_new":
      return <Store className="h-5 w-5 text-emerald-600" />
    case "listing_new":
      return <ShoppingBag className="h-5 w-5 text-orange-600" />
    case "post_new":
      return <MessageCircle className="h-5 w-5 text-sky-600" />
    case "proposal_new":
      return <Vote className="h-5 w-5 text-indigo-600" />
    case "deal_new":
      return <Tag className="h-5 w-5 text-rose-600" />
    default:
      return <Megaphone className="h-5 w-5 text-muted-foreground" />
  }
}

function formatRelativeTime(dateString: string): string {
  const now = new Date()
  const date = new Date(dateString)
  const diffMs = now.getTime() - date.getTime()
  const diffMinutes = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMinutes < 1) return "Gerade eben"
  if (diffMinutes < 60) return `vor ${diffMinutes} Min.`
  if (diffHours < 24) return `vor ${diffHours} Std.`
  if (diffDays < 7) return `vor ${diffDays} ${diffDays === 1 ? "Tag" : "Tagen"}`
  return date.toLocaleDateString("de-DE", { day: "numeric", month: "short" })
}

export function NotificationCard({ notification, isUnread, onClick }: NotificationCardProps) {
  const isClickable = !!notification.link

  return (
    <div
      role={isClickable ? "link" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={isClickable ? onClick : undefined}
      onKeyDown={isClickable ? (e) => { if (e.key === "Enter") onClick?.() } : undefined}
      className={cn(
        "flex items-start gap-3 p-4 rounded-[10px] border transition-colors",
        isUnread
          ? "bg-blue-50/60 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800"
          : "bg-card border-border",
        isClickable && "cursor-pointer hover:shadow-md hover:border-border"
      )}
    >
      {/* Unread dot */}
      <div className="flex-shrink-0 pt-1">
        {isUnread ? (
          <div className="h-2.5 w-2.5 rounded-full bg-blue-500" />
        ) : (
          <div className="h-2.5 w-2.5" />
        )}
      </div>

      {/* Icon or Profile Picture */}
      <div className="flex-shrink-0 mt-0.5">
        {notification.image_url ? (
          <div className="h-8 w-8 rounded-full overflow-hidden bg-muted flex-shrink-0">
            <img
              src={notification.image_url}
              alt=""
              className="h-full w-full object-cover"
            />
          </div>
        ) : (
          getNotificationIcon(notification.type)
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm", isUnread ? "font-semibold text-foreground" : "font-medium text-foreground")}>
          {notification.title}
        </p>
        {notification.body && (
          <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
            {notification.body}
          </p>
        )}
        <p className="text-xs text-muted-foreground mt-1.5">
          {formatRelativeTime(notification.created_at)}
        </p>
      </div>

      {/* Arrow for clickable */}
      {isClickable && (
        <div className="flex-shrink-0 self-center">
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      )}
    </div>
  )
}
