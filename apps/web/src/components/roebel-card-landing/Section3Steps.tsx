import Image from "next/image";
import { ArrowRight, Building2, ShieldCheck, Smartphone, Wallet } from "lucide-react";

import { cn } from "@/lib/utils";

interface StepCard {
  title: string;
  description: string;
  illustration: React.ReactNode;
  accent: string;
}

const STEP_CARDS: StepCard[] = [
  {
    title: "Einfach in der Röbel App",
    description:
      "Eröffnen Sie Ihre Karte in wenigen Minuten direkt in der Röbel App — kein Papierkram, kein Termin.",
    illustration: <PhonePlaceholder />,
    accent: "from-blue-50 to-white",
  },
  {
    title: "Bei Partner-Geschäften aufladen",
    description:
      "Aufladen, einlösen und Guthaben prüfen — direkt am Tresen Ihres Lieblingsgeschäfts in Röbel.",
    illustration: (
      <IconBlock>
        <Building2 className="h-10 w-10 text-primary" strokeWidth={1.6} />
      </IconBlock>
    ),
    accent: "from-blue-50 to-white",
  },
  {
    title: "Jederzeit abheben oder aufladen",
    description:
      "Ihr Guthaben gehört Ihnen. Aufladen oder zurückerstatten — wann immer Sie möchten.",
    illustration: (
      <IconBlock>
        <Wallet className="h-10 w-10 text-primary" strokeWidth={1.6} />
      </IconBlock>
    ),
    accent: "from-blue-50 to-white",
  },
  {
    title: "Ihr Guthaben ist geschützt",
    description:
      "Ihr Geld liegt sicher auf einem Treuhandkonto, geführt vom angemeldeten gemeinnützigen Verein aus Röbel — 1:1 gedeckt, jederzeit auszahlbar.",
    illustration: (
      <IconBlock>
        <ShieldCheck className="h-10 w-10 text-primary" strokeWidth={1.6} />
      </IconBlock>
    ),
    accent: "from-blue-50 to-white",
  },
];

export function Section3Steps() {
  return (
    <section className="bg-card py-20 sm:py-24">
      <div className="container mx-auto px-4">
        <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-xl">
            <h2 className="text-balance text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">
              So funktioniert die Röbel Card
            </h2>
            <p className="mt-3 text-base text-muted-foreground">
              Vier einfache Schritte — vom ersten Aufladen bis zur sicheren
              Verwahrung Ihres Guthabens.
            </p>
          </div>
          <p className="hidden items-center gap-2 text-sm text-muted-foreground sm:inline-flex">
            Wischen <ArrowRight className="h-4 w-4" />
          </p>
        </div>

        <div className="-mx-4 px-4">
          <div className="scrollbar-hide flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4">
            {STEP_CARDS.map((card) => (
              <article
                key={card.title}
                className={cn(
                  "snap-start flex-shrink-0 overflow-hidden rounded-3xl border border-border bg-gradient-to-br p-6 shadow-sm transition-shadow hover:shadow-md",
                  "w-[80%] max-w-[320px] sm:w-[320px]",
                  card.accent,
                )}
              >
                <div className="mb-6 flex h-44 items-center justify-center">
                  {card.illustration}
                </div>
                <h3 className="text-lg font-semibold text-foreground">
                  {card.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {card.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function IconBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-32 w-32 items-center justify-center rounded-3xl bg-primary/8 ring-1 ring-primary/15">
      {children}
    </div>
  );
}

function PhonePlaceholder() {
  return (
    <div className="relative h-40 w-24">
      <div className="absolute inset-0 rounded-[26px] border-[3px] border-foreground/80 bg-card shadow-md">
        <div className="absolute left-1/2 top-1.5 h-1.5 w-12 -translate-x-1/2 rounded-full bg-foreground/80" />
        <div className="flex h-full flex-col items-center justify-center gap-2 px-3 pt-4">
          <div className="relative h-12 w-full">
            <Image
              src="/logo.png"
              alt=""
              fill
              className="object-contain"
              sizes="80px"
            />
          </div>
          <div className="h-1.5 w-12 rounded-full bg-primary/30" />
          <div className="h-1.5 w-16 rounded-full bg-primary/20" />
          <div className="mt-2 h-8 w-full rounded-md bg-primary" />
        </div>
      </div>
    </div>
  );
}
