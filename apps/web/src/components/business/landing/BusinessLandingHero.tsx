import Link from "next/link"
import { Store, ShoppingBag, Users } from "lucide-react"

interface BusinessLandingHeroProps {
  businessCount: number
  activeDealsCount: number
  userCount: number
}

export function BusinessLandingHero({ businessCount, activeDealsCount, userCount }: BusinessLandingHeroProps) {
  return (
    <section className="bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="container mx-auto px-4 py-16 md:py-24">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          {/* Left — Copy */}
          <div>
            <div className="inline-flex items-center gap-2 bg-card border border-border rounded-full px-3 py-1 text-sm text-muted-foreground mb-6">
              <Store className="h-4 w-4 text-primary" />
              Für lokale Unternehmen
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground leading-tight tracking-tight">
              Erreichen Sie Ihre Nachbarn in{" "}
              <span className="text-primary">Röbel/Müritz</span>
            </h1>

            <p className="mt-5 text-lg text-muted-foreground max-w-lg">
              Registrieren Sie Ihr Gewerbe kostenlos, erstellen Sie lokale Angebote und
              verbinden Sie sich direkt mit Ihrer Nachbarschaft.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link
                href="/app/gewerbe/erstellen"
                className="inline-flex items-center justify-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-base transition-colors"
              >
                Kostenlos registrieren
              </Link>
              <a
                href="#vorteile"
                className="inline-flex items-center justify-center px-6 py-3 bg-card hover:bg-accent text-foreground font-medium rounded-lg text-base border border-border transition-colors"
              >
                Mehr erfahren
              </a>
            </div>
          </div>

          {/* Right — Visual */}
          <div className="relative hidden md:flex items-center justify-center">
            <div className="w-80 h-80 bg-blue-100/60 rounded-3xl flex items-center justify-center">
              <div className="space-y-4 w-64">
                {/* Mock card 1 */}
                <div className="bg-card rounded-xl p-4 shadow-sm border border-border">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                      <ShoppingBag className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">Bäckerei Müller</p>
                      <p className="text-xs text-muted-foreground">20% auf alle Brötchen</p>
                    </div>
                  </div>
                </div>
                {/* Mock card 2 */}
                <div className="bg-card rounded-xl p-4 shadow-sm border border-border">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                      <Store className="h-5 w-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">Café am See</p>
                      <p className="text-xs text-muted-foreground">Neues Frühstücksmenü</p>
                    </div>
                  </div>
                </div>
                {/* Mock card 3 */}
                <div className="bg-card rounded-xl p-4 shadow-sm border border-border">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
                      <Users className="h-5 w-5 text-orange-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">Friseur Salon Röbel</p>
                      <p className="text-xs text-muted-foreground">Termin online buchen</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Stats bar */}
        <div className="mt-16 grid grid-cols-3 gap-6 max-w-lg">
          <div>
            <p className="text-2xl sm:text-3xl font-bold text-foreground">{businessCount}</p>
            <p className="text-sm text-muted-foreground">Registrierte Gewerbe</p>
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-bold text-foreground">{activeDealsCount}</p>
            <p className="text-sm text-muted-foreground">Aktive Angebote</p>
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-bold text-foreground">{userCount}</p>
            <p className="text-sm text-muted-foreground">Bürger in der App</p>
          </div>
        </div>
      </div>
    </section>
  )
}
