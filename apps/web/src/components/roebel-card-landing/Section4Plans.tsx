import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { InterestCTAButtons } from "./InterestCTAButtons";

interface PlanFeature {
  label: string;
  detail?: string;
}

interface Plan {
  eyebrow: string;
  name: string;
  highlight: string;
  highlightSubtext: string;
  features: PlanFeature[];
  cta: "citizen" | "merchant";
  emphasis?: boolean;
}

const PLANS: Plan[] = [
  {
    eyebrow: "Für Unternehmen",
    name: "Sachbezug bis 50 €/Monat",
    highlight: "0 % Aufladegebühr",
    highlightSubtext:
      "Es fällt eine gemeinnützige Gebühr von 5 % an, die in Röbeler Vereine fließt.",
    features: [
      {
        label: "50 € Monatslimit pro Mitarbeiter",
        detail:
          "Steuer- und sozialabgabenfrei nach § 8 Abs. 2 Satz 11 EStG (Sachbezug).",
      },
      { label: "0 % Aufladegebühr", detail: "Keine versteckten Kosten." },
      { label: "Dauer-Support", detail: "Persönlicher Ansprechpartner aus Röbel." },
      {
        label: "Funktioniert bei allen Partner-Geschäften",
        detail: "Mit jedem teilnehmenden Geschäft in Röbel und Umgebung.",
      },
    ],
    cta: "merchant",
  },
  {
    eyebrow: "Für Bürger",
    name: "Privates Guthaben",
    highlight: "Kein Monatslimit",
    highlightSubtext:
      "Bei jeder Transaktion fließen 5 % automatisch an Röbeler Vereine.",
    features: [
      {
        label: "Kein Monatslimit",
        detail: "Laden Sie so viel auf, wie Sie möchten — jederzeit.",
      },
      { label: "0 % Aufladegebühr", detail: "Sie zahlen nichts extra." },
      { label: "Dauer-Support", detail: "Bei Fragen einfach in der App melden." },
      {
        label: "Funktioniert bei allen Partner-Geschäften",
        detail: "Mit jedem teilnehmenden Geschäft in Röbel und Umgebung.",
      },
    ],
    cta: "citizen",
    emphasis: true,
  },
];

export function Section4Plans() {
  return (
    <section className="bg-background py-20 sm:py-28">
      <div className="container mx-auto px-4">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <h2 className="text-balance text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">
            Eine Karte. Zwei Wege, lokal zu wirken.
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            Ob als Unternehmen, das den steuerfreien Sachbezug nutzt, oder als
            Bürger, der lokal einkaufen will — die Röbel Card passt sich an.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
          {PLANS.map((plan) => (
            <article
              key={plan.eyebrow}
              className={cn(
                "relative flex flex-col rounded-3xl border bg-card p-7 shadow-sm sm:p-8",
                plan.emphasis ? "border-primary/30 ring-2 ring-primary/15" : "border-border",
              )}
            >
              <div className="mb-6">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                  {plan.eyebrow}
                </p>
                <h3 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                  {plan.name}
                </h3>
              </div>

              <div className="mb-6 rounded-2xl bg-muted/60 p-5">
                <p className="text-2xl font-semibold tracking-tight text-foreground">
                  {plan.highlight}
                </p>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {plan.highlightSubtext}
                </p>
              </div>

              <ul className="mb-8 flex-1 space-y-4">
                {plan.features.map((feature) => (
                  <li key={feature.label} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    </span>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {feature.label}
                      </p>
                      {feature.detail && (
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          {feature.detail}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              <InterestCTAButtons
                citizenOnly={plan.cta === "citizen"}
                merchantOnly={plan.cta === "merchant"}
                layout="row"
              />
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
