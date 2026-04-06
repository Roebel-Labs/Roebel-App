"use client"

import { useEffect, useState } from "react"
import { Smartphone, X } from "lucide-react"
import { Button } from "@/components/ui/button"

interface DeepLinkRedirectProps {
  /** Direct Expo route path, e.g. "/event/123" or "/order/slug/table" */
  path?: string
  /** Legacy: content type */
  type?: "event" | "news"
  /** Legacy: content ID */
  id?: string
}

export function DeepLinkRedirect({ path, type, id }: DeepLinkRedirectProps) {
  const [dismissed, setDismissed] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent))
  }, [])

  if (!isMobile || dismissed) return null

  // Build the deep link URL
  let appPath = path
  if (!appPath && type && id) {
    appPath = type === "event" ? `/event/${id}` : `/news/${id}`
  }
  if (!appPath) return null

  const deepLink = `roebel://${appPath}`

  const handleOpenApp = () => {
    window.location.href = deepLink
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-primary text-primary-foreground shadow-lg pb-safe">
      <div className="flex items-center justify-between max-w-md mx-auto">
        <div className="flex items-center gap-3">
          <Smartphone className="h-5 w-5" />
          <span className="text-sm font-medium">In der App öffnen</span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={handleOpenApp}>
            Öffnen
          </Button>
          <button
            onClick={() => setDismissed(true)}
            className="p-1 hover:bg-primary-foreground/10 rounded"
            aria-label="Schließen"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
