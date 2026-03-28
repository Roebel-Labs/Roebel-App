"use client"

import { useState, useEffect, useCallback } from "react"
import { getNotificationCounts, type NotificationCounts } from "@/app/actions/notification-counts"

interface UseNotificationCountsReturn {
  counts: NotificationCounts | null
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useNotificationCounts(
  pollingInterval: number = 60000 // Default: 60 seconds
): UseNotificationCountsReturn {
  const [counts, setCounts] = useState<NotificationCounts | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchCounts = useCallback(async () => {
    try {
      const result = await getNotificationCounts()
      if (result.success && result.data) {
        setCounts(result.data)
        setError(null)
      } else {
        setError(result.error || "Unknown error")
      }
    } catch (err) {
      setError("Failed to fetch notification counts")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    // Initial fetch
    fetchCounts()

    // Set up polling interval
    const interval = setInterval(fetchCounts, pollingInterval)

    return () => clearInterval(interval)
  }, [fetchCounts, pollingInterval])

  return {
    counts,
    isLoading,
    error,
    refetch: fetchCounts,
  }
}
