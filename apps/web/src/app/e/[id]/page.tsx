import type { Metadata } from "next"
import Link from "next/link"
import { EventOpenCTA } from "./EventOpenCTA"

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await params
  return {
    title: "Du bist zu einem Röbel-Event eingeladen",
    description:
      "Scanne den Code mit der Röbel App: tritt Röbel Münzen bei, sammle lokale Münzen und sichere dir deinen „War in Röbel“-Beleg.",
    openGraph: {
      title: "Röbel-Event — Einladung",
      description:
        "Öffne den Link in der Röbel App, tritt Röbel Münzen bei und sammle lokale Münzen.",
    },
  }
}

// Smart Event QR web landing (roebel.app/e/<id>). Opened when the link lands in a
// browser instead of the app (tourist without the app, or the phone camera). It only
// needs the route `id` — it never reads the RLS-locked `reward_events` row, so it stays
// generic and works for any event id. The branch logic (onboard / attendance reward)
// lives entirely in the Expo route app/e/[id].tsx once the app opens.
export default async function EventLandingPage({ params }: Props) {
  const { id } = await params

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#00498B] via-[#264e8e] to-[#E4F2FF] text-white">
      <header className="max-w-4xl mx-auto px-6 pt-8 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Röbel" className="w-10 h-10" />
          <span className="font-semibold">Röbel App</span>
        </Link>
        <Link href="/about" className="text-sm underline opacity-80 hover:opacity-100">
          Was ist Röbel?
        </Link>
      </header>

      <main className="max-w-xl mx-auto px-6 pt-12 pb-24 text-center">
        <div className="mb-8">
          <div className="w-24 h-24 rounded-full mx-auto bg-white/10 flex items-center justify-center text-5xl">
            🎉
          </div>
        </div>

        <p className="text-sm uppercase tracking-widest text-white/70 mb-2">
          Event-Einladung
        </p>
        <h1 className="text-3xl md:text-4xl font-semibold leading-tight mb-4">
          Du bist zu einem Röbel-Event eingeladen
        </h1>
        <p className="text-base md:text-lg text-white/80 mb-8">
          Tritt mit der Röbel App den Röbel Münzen bei, sammle lokale Münzen und
          sichere dir deinen „War in Röbel“-Beleg. Bezahlt aus der Stadtkasse —
          nicht von dir.
        </p>

        <EventOpenCTA id={id} />

        <div className="mt-10 text-left bg-white/10 rounded-2xl p-5 backdrop-blur">
          <p className="text-lg font-semibold mb-2">So funktioniert&apos;s</p>
          <ul className="space-y-2 text-sm text-white/90">
            <li className="flex gap-2">
              <span>📲</span>
              <span>Röbel App öffnen oder installieren</span>
            </li>
            <li className="flex gap-2">
              <span>🪙</span>
              <span>Röbel Münzen beitreten — du sammelst ab jetzt eigene Münzen</span>
            </li>
            <li className="flex gap-2">
              <span>✅</span>
              <span>„War in Röbel“-Beleg fürs Dabeisein erhalten</span>
            </li>
          </ul>
        </div>

        <p className="mt-8 text-xs text-white/60">
          Tipp: Schon Bürger:in? Öffne den Link in der App, um direkt deinen
          Event-Beleg abzuholen.
        </p>
      </main>
    </div>
  )
}
