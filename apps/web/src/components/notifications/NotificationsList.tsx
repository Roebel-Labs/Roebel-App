"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { NotificationCard } from "./NotificationCard"
import { getUnifiedNotifications } from "@/app/actions/app-notifications"
import type { UnifiedNotification } from "@/types/app-notifications"
import { Bell } from "lucide-react"

const STORAGE_KEY = "lastViewedNotifications"

interface NotificationsListProps {
  initialNotifications: UnifiedNotification[]
  initialTotal: number
}

export function NotificationsList({ initialNotifications, initialTotal }: NotificationsListProps) {
  const router = useRouter()
  const [notifications, setNotifications] = useState(initialNotifications)
  const [total, setTotal] = useState(initialTotal)
  const [lastViewed, setLastViewed] = useState<string | null>(null)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  // Read last viewed timestamp and then update it
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    setLastViewed(stored)

    // Update the timestamp so next visit shows all as read
    localStorage.setItem(STORAGE_KEY, new Date().toISOString())
  }, [])

  const isUnread = (notification: UnifiedNotification) => {
    if (!lastViewed) return true // First visit: all are unread
    return new Date(notification.created_at) > new Date(lastViewed)
  }

  const handleClick = (notification: UnifiedNotification) => {
    if (notification.link) {
      router.push(notification.link)
    }
  }

  const loadMore = useCallback(async () => {
    if (isLoadingMore || notifications.length >= total) return
    setIsLoadingMore(true)
    try {
      const result = await getUnifiedNotifications({
        limit: 30,
        offset: notifications.length,
      })
      if (result.success && result.data) {
        setNotifications((prev) => [...prev, ...result.data!])
        if (result.total !== undefined) setTotal(result.total)
      }
    } finally {
      setIsLoadingMore(false)
    }
  }, [isLoadingMore, notifications.length, total])

  if (notifications.length === 0) {
    return (
      <div className="text-center py-16 bg-card border border-border rounded-[10px]">
        <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground text-lg">Keine Benachrichtigungen</p>
        <p className="text-muted-foreground text-sm mt-1">
          Hier erscheinen zukünftige Benachrichtigungen.
        </p>
      </div>
    )
  }

  const unreadCount = notifications.filter(isUnread).length

  return (
    <div className="space-y-6">
      {unreadCount > 0 && (
        <p className="text-sm text-muted-foreground">
          {unreadCount} neue {unreadCount === 1 ? "Benachrichtigung" : "Benachrichtigungen"}
        </p>
      )}

      <div className="space-y-3">
        {notifications.map((notification) => (
          <NotificationCard
            key={notification.id}
            notification={notification}
            isUnread={isUnread(notification)}
            onClick={() => handleClick(notification)}
          />
        ))}
      </div>

      {notifications.length < total && (
        <div className="text-center pt-4">
          <button
            onClick={loadMore}
            disabled={isLoadingMore}
            className="px-6 py-2.5 text-sm font-medium text-foreground bg-card border border-border rounded-[10px] hover:bg-accent transition-colors disabled:opacity-50"
          >
            {isLoadingMore ? "Laden..." : "Mehr laden"}
          </button>
        </div>
      )}
    </div>
  )
}
