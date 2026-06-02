"use client"

import { useEffect, useState } from "react"
import { QRCodeSVG } from "qrcode.react"

interface ShareQrProps {
  /** Path on this site, e.g. "/dokumentation". Resolved to an absolute URL. */
  path: string
  size?: number
  /** Show the resolved URL as text below the QR code. */
  showUrl?: boolean
}

/**
 * Renders a QR code pointing at an absolute URL for the given path.
 * Uses NEXT_PUBLIC_SITE_URL when set, otherwise window.location.origin.
 */
export function ShareQr({ path, size = 200, showUrl = false }: ShareQrProps) {
  const [origin, setOrigin] = useState<string>(
    process.env.NEXT_PUBLIC_SITE_URL || ""
  )

  useEffect(() => {
    if (!origin && typeof window !== "undefined") {
      setOrigin(window.location.origin)
    }
  }, [origin])

  const url = `${origin}${path}`

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="rounded-[10px] bg-white p-4">
        <QRCodeSVG value={url} size={size} level="M" />
      </div>
      {showUrl && origin && (
        <p className="break-all text-center text-sm text-muted-foreground">{url}</p>
      )}
    </div>
  )
}

export default ShareQr
