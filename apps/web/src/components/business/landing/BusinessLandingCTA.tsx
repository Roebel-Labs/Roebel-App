import Link from "next/link"

export function BusinessLandingCTA() {
  return (
    <section className="bg-foreground py-16 md:py-24">
      <div className="container mx-auto px-4 text-center">
        <h2 className="text-3xl sm:text-4xl font-bold text-white">
          Bereit loszulegen?
        </h2>
        <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
          Registrieren Sie Ihr Gewerbe kostenlos und erreichen Sie Ihre Nachbarn in Röbel/Müritz.
        </p>
        <Link
          href="/app/gewerbe/erstellen"
          className="inline-flex items-center justify-center mt-8 px-8 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-base transition-colors"
        >
          Jetzt Gewerbe anmelden
        </Link>
      </div>
    </section>
  )
}
