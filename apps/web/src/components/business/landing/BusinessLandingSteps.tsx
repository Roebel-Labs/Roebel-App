import { UserPlus, FileText, Megaphone } from "lucide-react"

const steps = [
  {
    number: 1,
    icon: UserPlus,
    title: "Registrieren",
    description:
      "Erstellen Sie ein Konto und beanspruchen Sie Ihr Gewerbeprofil in wenigen Minuten.",
  },
  {
    number: 2,
    icon: FileText,
    title: "Profil erstellen",
    description:
      "Fügen Sie Beschreibung, Öffnungszeiten, Bilder und Kontaktdaten hinzu.",
  },
  {
    number: 3,
    icon: Megaphone,
    title: "Kunden erreichen",
    description:
      "Erscheinen Sie im Verzeichnis, erstellen Sie lokale Angebote und gewinnen Sie neue Kunden.",
  },
]

export function BusinessLandingSteps() {
  return (
    <section className="bg-muted py-16 md:py-24">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground">So funktioniert&apos;s</h2>
          <p className="mt-3 text-muted-foreground">In drei einfachen Schritten zu Ihrem digitalen Gewerbeauftritt.</p>
        </div>

        <div className="max-w-3xl mx-auto">
          <div className="relative">
            {/* Connecting line */}
            <div className="absolute left-6 top-12 bottom-12 w-px bg-muted hidden md:block" />

            <div className="space-y-8 md:space-y-12">
              {steps.map((step) => {
                const Icon = step.icon
                return (
                  <div key={step.number} className="flex gap-5 items-start">
                    {/* Number */}
                    <div className="relative z-10 shrink-0 w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-lg">
                      {step.number}
                    </div>
                    {/* Content */}
                    <div className="bg-card rounded-xl border border-border p-5 flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Icon className="h-5 w-5 text-primary" />
                        <h3 className="font-semibold text-foreground text-lg">{step.title}</h3>
                      </div>
                      <p className="text-muted-foreground text-sm">{step.description}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
