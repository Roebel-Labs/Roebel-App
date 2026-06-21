"use client"

import { useEffect, useMemo, useRef, useState } from "react"

// Canonical store URLs (same as apps/expo/constants/app-store.ts and the order/landesmeisterschaft pages).
const APP_STORE_URL = "https://apps.apple.com/de/app/r%C3%B6bel/id6754984699"
const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.maxbrych.roebelonchain&hl=de"

// Deep links: the universal https link opens the app directly where universal/app
// links are configured (AASA + assetlinks), and the custom scheme is the reliable
// fallback that works regardless of universal-link setup.
const universalLink = (id: string) => `https://www.roebel.app/e/${id}`
const schemeLink = (id: string) => `roebel://e/${id}`

type Platform = "ios" | "android" | "other"

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other"
  const ua = navigator.userAgent.toLowerCase()
  if (/iphone|ipad|ipod/.test(ua)) return "ios"
  if (/android/.test(ua)) return "android"
  return "other"
}

export function EventOpenCTA({ id }: { id: string }) {
  const [platform, setPlatform] = useState<Platform>("other")
  const autoTried = useRef(false)

  const storeUrl = useMemo(
    () => (platform === "ios" ? APP_STORE_URL : PLAY_STORE_URL),
    [platform],
  )

  useEffect(() => {
    const p = detectPlatform()
    setPlatform(p)
    // On mobile, attempt to open the app automatically once. If the app isn't
    // installed the scheme navigation no-ops and the user falls back to the
    // visible buttons (we deliberately do NOT auto-redirect to the store, so the
    // explainer/branded landing stays visible for first-time visitors).
    if ((p === "ios" || p === "android") && !autoTried.current) {
      autoTried.current = true
      window.location.href = schemeLink(id)
    }
  }, [id])

  function handleOpenApp() {
    // Try the custom scheme first (most reliable), then fall back to the store.
    // If the app is installed, the page unload cancels the pending store redirect.
    window.location.href = schemeLink(id)
    window.setTimeout(() => {
      window.location.href = storeUrl
    }, 1500)
  }

  if (platform === "other") {
    return (
      <div className="flex flex-col gap-3">
        <a
          href={universalLink(id)}
          className="px-6 py-4 rounded-full bg-white text-[#194383] font-semibold text-base hover:opacity-90 transition"
        >
          In der App öffnen
        </a>
        <div className="flex gap-3 justify-center">
          <a
            href={APP_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-3 rounded-full bg-white/15 text-white font-semibold text-sm hover:bg-white/25 transition"
          >
            App Store
          </a>
          <a
            href={PLAY_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-3 rounded-full bg-white/15 text-white font-semibold text-sm hover:bg-white/25 transition"
          >
            Play Store
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={handleOpenApp}
        className="px-6 py-4 rounded-full bg-white text-[#194383] font-semibold text-base hover:opacity-90 transition"
      >
        In der App öffnen
      </button>
      <a
        href={storeUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm underline text-white/80 hover:text-white"
      >
        App installieren ({platform === "ios" ? "App Store" : "Play Store"})
      </a>
    </div>
  )
}
