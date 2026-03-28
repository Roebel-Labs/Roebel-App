import { Check, Tag, Sparkles, Star, Store } from "lucide-react"

const features = [
  "Kostenlose Basis-Anzeigen auf Ihrem Gewerbeprofil",
  "Anzeigen im Gewerbe-Verzeichnis sichtbar",
  'Angebote auf der "Lokale Angebote" Seite für alle Bürger',
  "Premium: Hervorgehobene Platzierung im Feed (coming soon)",
]

export function BusinessLandingAds() {
  return (
    <section className="bg-card py-16 md:py-24">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
            Lokale Werbung für Ihr Unternehmen
          </h2>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
            Erstellen Sie Angebote, die direkt bei Ihren Nachbarn ankommen — kostenlos.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 max-w-5xl mx-auto items-center">
          {/* Left — Feature list */}
          <div>
            <ul className="space-y-4">
              {features.map((feature) => (
                <li key={feature} className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                  <span className="text-foreground">{feature}</span>
                </li>
              ))}
            </ul>

            <div className="mt-8 bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-sm font-medium text-blue-800">Kostenlos starten</p>
              <p className="text-xs text-primary mt-1">
                Erstellen Sie unbegrenzt kostenlose Anzeigen. Optionale Boost-Funktionen
                für maximale Sichtbarkeit werden bald verfügbar sein.
              </p>
            </div>
          </div>

          {/* Right — Mock ad cards */}
          <div className="space-y-4">
            {/* Mock ad card 1 */}
            <div className="bg-card rounded-lg border border-border overflow-hidden shadow-sm">
              <div className="h-28 bg-gradient-to-r from-green-100 to-green-50 flex items-center justify-center">
                <Tag className="h-10 w-10 text-green-400" />
              </div>
              <div className="p-3">
                <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-700">
                  <Tag className="h-3.5 w-3.5" />
                  Rabatt
                </span>
                <h4 className="font-semibold text-foreground text-sm mt-1.5">20% auf alle Backwaren</h4>
                <p className="text-xs text-muted-foreground mt-0.5">Diese Woche bei der Bäckerei Müller</p>
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border">
                  <div className="w-5 h-5 rounded bg-muted flex items-center justify-center">
                    <Store className="h-3 w-3 text-muted-foreground" />
                  </div>
                  <span className="text-xs text-muted-foreground">Bäckerei Müller</span>
                </div>
              </div>
            </div>

            {/* Mock ad card 2 — boosted */}
            <div className="bg-card rounded-lg border border-border overflow-hidden shadow-sm relative">
              <div className="h-28 bg-gradient-to-r from-purple-100 to-purple-50 flex items-center justify-center">
                <Sparkles className="h-10 w-10 text-purple-400" />
              </div>
              <span className="absolute top-2 right-2 inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-yellow-400 text-yellow-900">
                <Star className="h-3 w-3" />
                Gesponsert
              </span>
              <div className="p-3">
                <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-purple-50 text-purple-700">
                  <Sparkles className="h-3.5 w-3.5" />
                  Spezialangebot
                </span>
                <h4 className="font-semibold text-foreground text-sm mt-1.5">Neues Sommermenü ab sofort!</h4>
                <p className="text-xs text-muted-foreground mt-0.5">Frische Gerichte aus der Region</p>
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border">
                  <div className="w-5 h-5 rounded bg-muted flex items-center justify-center">
                    <Store className="h-3 w-3 text-muted-foreground" />
                  </div>
                  <span className="text-xs text-muted-foreground">Café am See</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
