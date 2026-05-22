import Image from "next/image";
import { Play, Quote } from "lucide-react";

import type { Business } from "@/types/business";

interface UnternehmenSocialProofProps {
  featuredBusinesses: Business[];
}

const PLACEHOLDER_LOGOS = [
  { label: "Gastro Röbel", initials: "GR" },
  { label: "Müritz Café", initials: "MC" },
  { label: "Stadt Werke", initials: "SW" },
];

export function UnternehmenSocialProof({
  featuredBusinesses,
}: UnternehmenSocialProofProps) {
  const visible = featuredBusinesses.slice(0, 6);
  const placeholders = PLACEHOLDER_LOGOS.slice(
    0,
    Math.max(0, 3 - visible.length),
  );

  return (
    <section
      className="bg-muted/40"
      style={{ fontFamily: "var(--font-inter), system-ui, sans-serif" }}
    >
      <div className="container mx-auto px-4 sm:px-6 py-14 md:py-20 lg:py-24">
        <h2 className="text-center text-xl sm:text-2xl lg:text-3xl font-semibold text-foreground max-w-3xl mx-auto leading-snug">
          Vertraut von lokalen Unternehmen und Initiativen in Röbel und Müritz.
        </h2>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-10 gap-y-6 sm:gap-x-14">
          {visible.map((b) =>
            b.logo_url ? (
              <div
                key={b.id}
                className="relative h-10 w-28 sm:h-12 sm:w-32 opacity-80 hover:opacity-100 transition-opacity"
              >
                <Image
                  src={b.logo_url}
                  alt={b.name}
                  fill
                  sizes="128px"
                  className="object-contain grayscale hover:grayscale-0 transition-[filter]"
                />
              </div>
            ) : (
              <LogoPlaceholder
                key={b.id}
                label={b.name}
                initials={initialsFor(b.name)}
              />
            ),
          )}
          {placeholders.map((p) => (
            <LogoPlaceholder key={p.label} label={p.label} initials={p.initials} />
          ))}
        </div>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 max-w-5xl mx-auto">
          <figure className="rounded-2xl border border-border bg-card p-6 sm:p-8 flex flex-col gap-4">
            <Quote className="h-6 w-6 text-primary" aria-hidden />
            <blockquote className="text-base sm:text-lg text-foreground leading-relaxed">
              „Gehalt und Grundleistungen sind nicht das Ende der Geschichte.
              Man muss aktiv zuhören, was Mitarbeitende wirklich brauchen. Mit
              Röbel können unsere Teams sicher zu Veranstaltungen kommen,
              lokale Gastronomen entdecken — und Wertschätzung wird sichtbar.“
            </blockquote>
            <figcaption className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Ryan Carter</span>
              <span className="block">Gründer & CEO, Müritz Werkstatt</span>
            </figcaption>
          </figure>

          <div className="relative rounded-2xl border border-border bg-card overflow-hidden aspect-video md:aspect-auto">
            <div className="absolute inset-0 bg-gradient-to-br from-foreground/80 via-foreground/60 to-foreground/40" aria-hidden />
            <div className="absolute inset-0 flex items-center justify-center">
              <button
                type="button"
                aria-label="Video abspielen"
                className="flex h-14 w-14 items-center justify-center rounded-full bg-background/90 text-foreground shadow-lg transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                <Play className="h-6 w-6 translate-x-[1px]" />
              </button>
            </div>
            <div className="absolute bottom-3 left-4 text-[11px] uppercase tracking-wide text-background/80">
              Platzhalter · Video
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function LogoPlaceholder({
  label,
  initials,
}: {
  label: string;
  initials: string;
}) {
  return (
    <div
      title={label}
      className="flex h-10 w-28 sm:h-12 sm:w-32 items-center justify-center rounded-md border border-border bg-card text-sm font-semibold text-muted-foreground"
    >
      {initials}
    </div>
  );
}
