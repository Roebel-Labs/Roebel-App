// Public landing page of a credential invitation link (/invite/ausweis/<token>). It never looks
// the token up: no server-side fetch or API call carries it, so it reaches no log beyond the page
// request itself. The app opens the link (universal link / app link, or the roebel:// button) and
// redeems the token there, signed in.
import type { Metadata } from "next"
import { AusweisOpenCTA } from "./AusweisOpenCTA"

export const metadata: Metadata = {
  title: "Ausweis abholen – Röbel App",
  description: "Du hast einen Ausweis erhalten. Öffne ihn in der Röbel App.",
  // The token is in the path: never send it on as a referrer, never index it.
  referrer: "no-referrer",
  robots: { index: false, follow: false },
}

const TOKEN = /^[A-Za-z0-9_-]{16,128}$/

export default async function AusweisInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const valid = TOKEN.test(token)

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-12 bg-[#00498B] text-white">
      <div className="w-full max-w-sm text-center space-y-6">
        <div className="text-5xl" aria-hidden>
          🪪
        </div>
        {valid ? (
          <>
            <h1 className="text-2xl font-bold">Du hast einen Ausweis erhalten</h1>
            <p className="text-white/80">
              Öffne den Link in der Röbel App, um den Ausweis anzusehen und anzunehmen. Der Link ist persönlich – bitte gib ihn nicht weiter.
            </p>
            <AusweisOpenCTA token={token} />
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold">Dieser Link ist ungültig</h1>
            <p className="text-white/80">Bitte prüfe, ob du den Link vollständig kopiert hast.</p>
          </>
        )}
      </div>
    </main>
  )
}
