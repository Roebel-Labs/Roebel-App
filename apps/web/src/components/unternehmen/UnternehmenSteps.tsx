import { CreditCard, Settings2, Users } from "lucide-react";

const STEPS = [
  {
    icon: Settings2,
    title: "Programme nach Ihren Regeln einrichten",
    body: "Definieren Sie Richtlinien, sichern Sie die Compliance bei Reise- und Verpflegungs­ausgaben und behalten Sie jeden Vorgang im Blick. Mit unseren Partnern integrieren Sie Abrechnung ohne zusätzliche Servicegebühr.",
    swatch: "from-primary/20 to-primary/5",
  },
  {
    icon: Users,
    title: "Mitarbeitende in Ihrem Tempo aufnehmen",
    body: "Laden Sie einzelne Personen, ganze Teams oder die gesamte Organisation auf einmal ein. Nach der Einladung können Mitarbeitende ein Geschäftsprofil zu ihrem bestehenden Röbel-Account hinzufügen.",
    swatch: "from-amber-200/60 to-amber-100/30",
  },
  {
    icon: CreditCard,
    title: "Guthaben für Mitarbeitende einrichten",
    body: "Verteilen Sie Guthaben in Form von Gutscheinen für Veranstaltungen, Verpflegung oder besondere Anlässe — eine wirkungsvolle Form der Wertschätzung, ohne den Verwaltungsaufwand.",
    swatch: "from-emerald-200/60 to-emerald-100/30",
  },
];

export function UnternehmenSteps() {
  return (
    <section
      className="bg-card border-t border-border"
      style={{ fontFamily: "var(--font-inter), system-ui, sans-serif" }}
    >
      <div className="container mx-auto px-4 sm:px-6 py-14 md:py-20 lg:py-24">
        <h2 className="text-2xl sm:text-3xl lg:text-4xl font-medium text-foreground max-w-3xl">
          Starten Sie ohne Vorlaufkosten
        </h2>

        <ol className="mt-10 relative">
          {/* Vertical timeline line (desktop only) */}
          <span
            className="hidden md:block absolute left-[calc(33%-1px)] lg:left-[calc(40%-1px)] top-4 bottom-4 w-px bg-border"
            aria-hidden
          />

          {STEPS.map((step, idx) => {
            const Icon = step.icon;
            return (
              <li
                key={step.title}
                className="grid grid-cols-1 md:grid-cols-[33%_1fr] lg:grid-cols-[40%_1fr] gap-6 md:gap-10 py-6 md:py-8 border-b border-border last:border-b-0"
              >
                <div className="relative flex md:justify-end">
                  <div
                    className={`w-full md:w-[260px] lg:w-[300px] aspect-[4/3] rounded-xl bg-gradient-to-br ${step.swatch} ring-1 ring-border flex items-center justify-center`}
                  >
                    <Icon className="h-10 w-10 text-foreground/70" aria-hidden />
                  </div>
                  {/* Dot on the timeline */}
                  <span
                    className="hidden md:block absolute right-[-30px] lg:right-[-37px] top-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-foreground ring-4 ring-card"
                    aria-hidden
                  />
                </div>
                <div className="md:pl-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Schritt {idx + 1}
                  </div>
                  <h3 className="mt-1 text-xl sm:text-2xl font-semibold text-foreground">
                    {step.title}
                  </h3>
                  <p className="mt-3 text-sm sm:text-base text-muted-foreground leading-relaxed max-w-xl">
                    {step.body}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
