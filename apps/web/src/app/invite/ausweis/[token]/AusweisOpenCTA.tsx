"use client"

// Store URLs as in app/e/[id]/EventOpenCTA.tsx (canonical, same as apps/expo/constants/app-store.ts).
const APP_STORE_URL = "https://apps.apple.com/de/app/r%C3%B6bel/id6754984699"
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.maxbrych.roebelonchain&hl=de"

/** The custom scheme works whether or not universal links are set up. No network call. */
const schemeLink = (token: string) => `roebel://invite/ausweis/${encodeURIComponent(token)}`

export function AusweisOpenCTA({ token }: { token: string }) {
  return (
    <div className="flex flex-col gap-3">
      <a
        href={schemeLink(token)}
        className="px-6 py-4 rounded-full bg-white text-[#00498B] font-semibold text-base hover:opacity-90 transition"
      >
        In der Röbel App öffnen
      </a>
      <p className="text-sm text-white/70 pt-2">Noch keine App? Hier installieren:</p>
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
