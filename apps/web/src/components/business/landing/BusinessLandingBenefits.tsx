import { Eye, Megaphone, Users, Sparkles } from "lucide-react"

const benefits = [
  {
    icon: Eye,
    iconBg: "bg-blue-100",
    iconColor: "text-primary",
    title: "Lokale Sichtbarkeit",
    description:
      "Erscheinen Sie im Gewerbe-Verzeichnis der Röbel App und werden Sie von Ihren Nachbarn gefunden.",
  },
  {
    icon: Megaphone,
    iconBg: "bg-purple-100",
    iconColor: "text-purple-600",
    title: "Angebote & Werbung",
    description:
      "Erstellen Sie lokale Anzeigen und Aktionen, die direkt bei Bürgern in Ihrer Nachbarschaft ankommen.",
  },
  {
    icon: Users,
    iconBg: "bg-green-100",
    iconColor: "text-green-600",
    title: "Direkte Verbindung",
    description:
      "Verbinden Sie sich mit verifizierten Community-Mitgliedern und bauen Sie echte Kundenbeziehungen auf.",
  },
  {
    icon: Sparkles,
    iconBg: "bg-amber-100",
    iconColor: "text-amber-600",
    title: "Kostenlos starten",
    description:
      "Der Basiszugang ist komplett kostenlos. Optionale Boost-Funktionen für maximale Reichweite.",
  },
]

export function BusinessLandingBenefits() {
  return (
    <section id="vorteile" className="bg-card py-16 md:py-24">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
            Warum Röbel App für Ihr Unternehmen?
          </h2>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
            Alles was Sie brauchen, um Ihr lokales Geschäft online sichtbar zu machen.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
          {benefits.map((benefit) => {
            const Icon = benefit.icon
            return (
              <div
                key={benefit.title}
                className="bg-card border border-border rounded-xl p-6 hover:shadow-md transition-shadow"
              >
                <div
                  className={`w-12 h-12 rounded-xl ${benefit.iconBg} flex items-center justify-center mb-4`}
                >
                  <Icon className={`h-6 w-6 ${benefit.iconColor}`} />
                </div>
                <h3 className="font-semibold text-foreground mb-2">{benefit.title}</h3>
                <p className="text-sm text-muted-foreground">{benefit.description}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
