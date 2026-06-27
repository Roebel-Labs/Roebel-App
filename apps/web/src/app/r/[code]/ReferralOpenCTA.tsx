"use client"

import { useEffect, useMemo, useState } from "react"

const APP_STORE_URL = "https://apps.apple.com/de/app/roebel-onchain/id0000000000"
const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.maxbrych.roebelonchain"
const APP_SCHEME = (code: string) => `roebel://r/${code}`

type Platform = "ios" | "android" | "other"

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other"
  const ua = navigator.userAgent.toLowerCase()
  if (/iphone|ipad|ipod/.test(ua)) return "ios"
  if (/android/.test(ua)) return "android"
  return "other"
}

export function ReferralOpenCTA({ code }: { code: string }) {
  const [platform, setPlatform] = useState<Platform>("other")
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setPlatform(detectPlatform())
  }, [])

  const storeUrl = useMemo(
    () => (platform === "ios" ? APP_STORE_URL : PLAY_STORE_URL),
    [platform]
  )

  // Deferred deep linking: the OS does not carry the referral link through a
  // store install, so copy the invite URL to the clipboard while we still have
  // a user gesture. The freshly installed app reads it once on first launch and
  // redeems the code. We copy the full /r/<CODE> URL so the app can validate it.
  function copyReferralToClipboard() {
    try {
      void navigator.clipboard?.writeText(`https://www.roebel.app/r/${code}`)
    } catch {
      // non-fatal — manual code entry in the app is the fallback
    }
  }

  function handleOpenApp() {
    copyReferralToClipboard()
    const scheme = APP_SCHEME(code)
    // Try the deep link; fall back to the store after a short timeout.
    // If the app is installed, the page unload will cancel the redirect.
    window.location.href = scheme
    window.setTimeout(() => {
      window.location.href = storeUrl
    }, 1500)
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(`https://www.roebel.app/r/${code}`)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  if (platform === "other") {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex gap-3 justify-center">
          <a
            href={APP_STORE_URL}
            onClick={copyReferralToClipboard}
            className="px-5 py-3 rounded-full bg-white text-[#00498B] font-semibold text-sm hover:opacity-90 transition"
          >
            App Store
          </a>
          <a
            href={PLAY_STORE_URL}
            onClick={copyReferralToClipboard}
            className="px-5 py-3 rounded-full bg-white text-[#00498B] font-semibold text-sm hover:opacity-90 transition"
          >
            Play Store
          </a>
        </div>
        <button
          onClick={handleCopy}
          className="text-sm underline text-white/80 hover:text-white"
        >
          {copied ? "Link kopiert" : "Link kopieren"}
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={handleOpenApp}
        className="px-6 py-4 rounded-full bg-white text-[#00498B] font-semibold text-base hover:opacity-90 transition"
      >
        App öffnen / installieren
      </button>
      <a
        href={storeUrl}
        onClick={copyReferralToClipboard}
        className="text-sm underline text-white/80 hover:text-white"
      >
        Direkt zum {platform === "ios" ? "App Store" : "Play Store"}
      </a>
      <button
        onClick={handleCopy}
        className="text-xs text-white/70 hover:text-white"
      >
        {copied ? "Link kopiert" : "Link kopieren"}
      </button>
    </div>
  )
}
