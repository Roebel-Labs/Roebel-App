"use client"

import { useState, useEffect, useCallback } from "react"
import { useActiveAccount } from "thirdweb/react"
import { getUnifiedNotifications } from "@/app/actions/app-notifications"

const STORAGE_KEY = "lastViewedNotifications"

export function useUnreadNotifications(pollingInterval: number = 60000) {
  const account = useActiveAccount()
  const walletAddress = account?.address ?? null
  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)

  const fetchUnreadCount = useCallback(async () => {
    try {
      const lastViewed = localStorage.getItem(STORAGE_KEY)

      // Fetch recent notifications scoped to the logged-in user (broadcast +
      // their own personal notifications). Logged-out → broadcast only.
      const result = await getUnifiedNotifications({ walletAddress, limit: 50 })
      if (!result.success || !result.data) {
        setUnreadCount(0)
        return
      }

      if (!lastViewed) {
        // First visit ever: show all as unread
        setUnreadCount(result.data.length)
        return
      }

      const lastViewedDate = new Date(lastViewed)
      const unread = result.data.filter(
        (n) => new Date(n.created_at) > lastViewedDate
      )
      setUnreadCount(unread.length)
    } catch {
      setUnreadCount(0)
    } finally {
      setIsLoading(false)
    }
  }, [walletAddress])

  useEffect(() => {
    fetchUnreadCount()

    const interval = setInterval(fetchUnreadCount, pollingInterval)
    return () => clearInterval(interval)
  }, [fetchUnreadCount, pollingInterval])

  // Listen for storage changes (when user visits notifications page in another tab)
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        fetchUnreadCount()
      }
    }
    window.addEventListener("storage", handleStorage)
    return () => window.removeEventListener("storage", handleStorage)
  }, [fetchUnreadCount])

  return { unreadCount, isLoading }
}
