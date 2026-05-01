import { CreditCard, ScanFace, Wallet } from "lucide-react";

interface FlowStep {
  index: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}

const STEPS: FlowStep[] = [
  {
    index: "01",
    title: "Karte in der App erhalten",
    description:
      'Öffnen Sie die Röbel App und tippen Sie auf „Karte erstellen". Keine Wartezeit, keine Bonitätsprüfung.',
    icon: <CreditCard className="h-6 w-6 text-primary" strokeWidth={1.7} />,
  },
  {
    index: "02",
    title: "Identität verifizieren",
    description:
      "Schnelle Verifizierung über Ihre Röbel-App-Identität — einmalig, in unter zwei Minuten.",
    icon: <ScanFace className="h-6 w-6 text-primary" strokeWidth={1.7} />,
  },
  {
    index: "03",
    title: "Aufladen & loslegen",
    description:
      "Per Überweisung oder direkt bei einem Partner-Geschäft. Bezahlen Sie kontaktlos in der App.",
    icon: <Wallet className="h-6 w-6 text-primary" strokeWidth={1.7} />,
  },
];

export function Section5AppFlow() {
  return (
    <section className="bg-card py-20 sm:py-28">
      <div className="container mx-auto px-4">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <h2 className="text-balance text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">
            Karte in der App erhalten
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            Drei Schritte vom ersten Öffnen der App bis zum ersten Einkauf.
          </p>
        </div>

        <ol className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
          {STEPS.map((step) => (
            <li
              key={step.index}
              className="relative flex flex-col rounded-3xl border border-border bg-background p-6 shadow-sm"
            >
              <div className="mb-5 flex items-center justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10">
                  {step.icon}
                </span>
                <span className="font-mono text-sm font-medium text-muted-foreground/70">
                  {step.index}
                </span>
              </div>
              <h3 className="text-lg font-semibold text-foreground">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {step.description}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
