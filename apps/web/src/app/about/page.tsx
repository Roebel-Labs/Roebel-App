import { EventsHeader } from "@/components/events/events-header"
import { Calendar, Vote, Users, Heart, CheckCircle, Target, Globe, Shield } from "lucide-react"

export const metadata = {
  title: "Über uns | Röbel App",
  description: "Erfahren Sie mehr über die Röbel App - die digitale Plattform für Veranstaltungen, Abstimmungen und Gemeinschaft in Röbel/Müritz.",
}

export default function AboutPage() {
  const features = [
    {
      icon: Calendar,
      title: "Veranstaltungen",
      description: "Entdecken Sie lokale Events und teilen Sie Ihre eigenen Veranstaltungen mit der Community.",
    },
    {
      icon: Vote,
      title: "Abstimmungen",
      description: "Nehmen Sie an demokratischen Entscheidungen teil und gestalten Sie die Zukunft Ihrer Stadt mit.",
    },
    {
      icon: Users,
      title: "Gemeinschaft",
      description: "Vernetzen Sie sich mit anderen Bürgern und stärken Sie das lokale Miteinander.",
    },
  ]

  const values = [
    {
      icon: Shield,
      title: "Transparenz",
      description: "Alle Entscheidungen und Abstimmungen sind öffentlich und nachvollziehbar.",
    },
    {
      icon: Heart,
      title: "Gemeinschaftlich",
      description: "Von der Community für die Community - jede Stimme zählt.",
    },
    {
      icon: Globe,
      title: "Lokal verwurzelt",
      description: "Fokus auf die Bedürfnisse und Anliegen der Menschen in Röbel/Müritz.",
    },
    {
      icon: Target,
      title: "Demokratisch",
      description: "Jeder Bürger hat die gleiche Möglichkeit, sich einzubringen und mitzubestimmen.",
    },
  ]

  return (
    <div className="min-h-screen bg-background">
      <EventsHeader />

      <main className="container mx-auto px-4 py-8 md:py-12">
        {/* Hero Section */}
        <div className="max-w-4xl mx-auto text-center mb-12 md:mb-16">
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-foreground mb-4">
            Über Röbel App
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground leading-relaxed">
            Die digitale Plattform für Veranstaltungen, Abstimmungen und Gemeinschaft in Röbel/Müritz
          </p>
        </div>

        {/* Mission Statement */}
        <div className="max-w-4xl mx-auto mb-12 md:mb-16">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 md:p-8">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <Heart className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground mb-3">
                  Unsere Mission
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  Die Röbel App wurde vom Kulturausschuss ins Leben gerufen, um das kulturelle und
                  gesellschaftliche Leben in Röbel/Müritz zu fördern. Wir schaffen eine digitale Plattform,
                  die es allen Bürgern ermöglicht, sich aktiv am Stadtleben zu beteiligen, Veranstaltungen
                  zu entdecken und bei wichtigen Entscheidungen mitzuwirken. Unser Ziel ist es, die lokale
                  Gemeinschaft zu stärken und demokratische Teilhabe für jeden zugänglich zu machen.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Features Grid */}
        <div className="mb-12 md:mb-16">
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground mb-3">
              Was wir bieten
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Die Röbel App vereint alle wichtigen Funktionen für ein aktives Stadtleben
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="bg-card border border-border rounded-xl shadow-sm p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">{feature.title}</h3>
                </div>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Values Section */}
        <div className="bg-muted -mx-4 px-4 py-12 md:py-16 mb-12 md:mb-16">
          <div className="container mx-auto">
            <div className="text-center mb-8 max-w-4xl mx-auto">
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground mb-3">
                Unsere Werte
              </h2>
              <p className="text-muted-foreground">
                Diese Prinzipien leiten uns bei allem, was wir tun
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
              {values.map((value) => (
                <div
                  key={value.title}
                  className="bg-card border border-border rounded-xl p-6"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 p-2 bg-green-50 rounded-lg">
                      <value.icon className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-foreground mb-2">{value.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {value.description}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* About Kulturausschuss */}
        <div className="max-w-4xl mx-auto mb-12">
          <div className="bg-card border border-border rounded-xl shadow-sm p-6 md:p-8">
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground mb-4">
              Der Kulturausschuss
            </h2>
            <div className="space-y-4 text-muted-foreground leading-relaxed">
              <p>
                Die Röbel App wird vom Kulturausschuss der Stadt Röbel/Müritz betrieben.
                Als ehrenamtliches Gremium setzen wir uns für die Förderung von Kultur,
                Bildung und Gemeinschaft in unserer Stadt ein.
              </p>
              <p>
                Durch die Digitalisierung von Verwaltungsprozessen und die Bereitstellung
                moderner Tools für demokratische Teilhabe möchten wir Röbel/Müritz zu einer
                noch lebenswerteren Stadt machen.
              </p>
            </div>
          </div>
        </div>

        {/* Call to Action */}
        <div className="max-w-4xl mx-auto">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 md:p-8 text-center">
            <h3 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground mb-3">
              Werden Sie Teil unserer Community
            </h3>
            <p className="text-muted-foreground mb-6">
              Nutzen Sie die Röbel App, um Veranstaltungen zu entdecken, an Abstimmungen teilzunehmen
              und sich mit anderen Bürgern zu vernetzen.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="/submit"
                className="inline-flex items-center justify-center px-6 py-3 bg-black text-white font-medium rounded-lg hover:bg-foreground/90 transition-colors"
              >
                Veranstaltung einreichen
              </a>
              <a
                href="/support"
                className="inline-flex items-center justify-center px-6 py-3 border-2 border-border bg-card text-foreground font-medium rounded-lg hover:border-black transition-colors"
              >
                Feedback geben
              </a>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
