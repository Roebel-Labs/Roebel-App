"use client";

import Link from "next/link";
import {
  Building2,
  Leaf,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { useUserProfile } from "@/hooks/useUserProfile";
import { getUserDisplayName } from "@/lib/user-types";
import { ConnectCta } from "./ConnectCta";

const STEPS = [
  { id: 1, label: "Konto" },
  { id: 2, label: "Profil" },
  { id: 3, label: "Verifizierung" },
  { id: 4, label: "Fertig" },
];

const BENEFITS = [
  {
    icon: Building2,
    title: "Bis zu 10 % Kosten sparen durch Compliance",
    body: "Lokale Unternehmen, die Röbel nutzen, berichten von messbar günstigeren Gewerbe- und Veranstaltungsausgaben. Behalten Sie Ausgaben im Blick und setzen Sie Richtlinien durch.",
  },
  {
    icon: Leaf,
    title: "Nachhaltigkeitsziele mit umsetzbaren Daten",
    body: "Verfolgen Sie den CO₂-Fußabdruck Ihrer Aktivitäten auf einem Dashboard. Diese Einblicke helfen, nachhaltige Optionen wie unsere lokalen Lieferanten gezielt einzusetzen.",
  },
  {
    icon: Sparkles,
    title: "Ein exklusives Erlebnis für Ihr Team",
    body: "Zusätzlich zu einfacher Abrechnung erhalten Mitarbeitende Zugang zu Premium-Angeboten von Röbeler Gastronomen und Veranstaltern — damit Arbeit und Kultur enger verbunden sind.",
  },
  {
    icon: ShieldCheck,
    title: "Priorität auf Sicherheit für Ihr Unternehmen",
    body: "Wir bieten zusätzliche Hinweise und Sicherheitskontrollen für Geschäftsnutzer:innen. Unser Sicherheitsbericht zeigt, dass 99,9 % aller Aktivitäten ohne Vorfall verlaufen.",
  },
];

function firstName(name: string): string {
  return name.split(/\s+/)[0] || name;
}

export function UnternehmenHero() {
  const { user, isConnected } = useUserProfile();

  const displayName = user ? getUserDisplayName(user) : null;
  const greeting = displayName ? firstName(displayName) : "";

  return (
    <section
      className="bg-foreground text-background"
      style={{ fontFamily: "var(--font-inter), system-ui, sans-serif" }}
    >
      <div className="container mx-auto px-4 sm:px-6 pt-10 pb-12 md:pt-16 md:pb-20 lg:pt-20 lg:pb-24">
        {isConnected ? (
          <Stepper />
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          <div className="order-2 lg:order-1">
            {isConnected ? (
              <>
                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-medium leading-[1.1] tracking-tight">
                  Willkommen{greeting ? `, ${greeting}` : ""}.<br />
                  Beginnen wir mit der Einrichtung.
                </h1>
                <p className="mt-5 max-w-xl text-base sm:text-lg text-background/70">
                  Sie sind nur noch wenige Schritte davon entfernt, das Röbel
                  Geschäftskonto Ihres Unternehmens einzurichten. Mit einer
                  einzigen Plattform können Sie Programme erstellen, die alle
                  Reise-, Verpflegungs- und Geschenkbedürfnisse Ihrer
                  Mitarbeitenden erfüllen.
                </p>
                <div className="mt-7 flex flex-wrap items-center gap-3">
                  <Link
                    href="/app/gewerbe/erstellen"
                    className="inline-flex items-center justify-center rounded-md bg-background text-foreground px-5 py-3 text-sm font-semibold transition-colors hover:bg-background/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-background focus-visible:ring-offset-2 focus-visible:ring-offset-foreground"
                  >
                    Ihr Unternehmen registrieren
                  </Link>
                </div>
              </>
            ) : (
              <>
                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-medium leading-[1.1] tracking-tight">
                  Alle Vorteile von Röbel,<br />
                  neu gedacht für Unternehmen.
                </h1>
                <p className="mt-5 max-w-xl text-base sm:text-lg text-background/70">
                  Röbel für Unternehmen gibt Ihrer Organisation mehr Kontrolle,
                  tiefere Einblicke und Funktionen, die für lokale Betriebe
                  gemacht sind. Verwalten Sie Mitarbeiterprogramme,
                  Verpflegung und Geschenklösungen — alles auf einem
                  Dashboard.
                </p>
                <div className="mt-7 flex flex-wrap items-center gap-3">
                  <ConnectCta
                    label="Jetzt starten"
                    variant="primary-light"
                    title="Bei Röbel anmelden"
                  />
                  <a
                    href="#loesungen"
                    className="inline-flex items-center justify-center rounded-md border border-background/40 text-background px-5 py-3 text-sm font-semibold transition-colors hover:bg-background/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-background focus-visible:ring-offset-2 focus-visible:ring-offset-foreground"
                  >
                    Lösungen ansehen
                  </a>
                </div>
              </>
            )}
          </div>

          <div className="order-1 lg:order-2">
            <HeroIllustration />
          </div>
        </div>

        {/* Section heading + benefits grid sits on the same dark band */}
        <div className="mt-14 md:mt-20 lg:mt-24" id="loesungen">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-medium leading-tight max-w-3xl">
            Eine globale Plattform, gebaut auf dem<br className="hidden sm:block" />
            stärksten Mobilitäts­netzwerk Röbels.
          </h2>

          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-8 lg:gap-x-16">
            {BENEFITS.map((benefit) => {
              const Icon = benefit.icon;
              return (
                <div key={benefit.title} className="flex gap-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-background/10">
                    <Icon className="h-5 w-5 text-background" aria-hidden />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-base sm:text-lg font-semibold leading-tight">
                      {benefit.title}
                    </h3>
                    <p className="mt-2 text-sm text-background/70 leading-relaxed">
                      {benefit.body}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function Stepper() {
  return (
    <div className="mb-10 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs sm:text-sm">
      {STEPS.map((step, idx) => {
        const isActive = idx === 0;
        return (
          <div key={step.id} className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span
                className={
                  isActive
                    ? "flex h-6 w-6 items-center justify-center rounded-full bg-background text-foreground text-[11px] font-semibold"
                    : "flex h-6 w-6 items-center justify-center rounded-full border border-background/40 text-background/70 text-[11px] font-medium"
                }
              >
                {step.id}
              </span>
              <span
                className={
                  isActive
                    ? "text-background font-medium"
                    : "text-background/60"
                }
              >
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 ? (
              <span className="hidden sm:block h-px w-8 bg-background/20" aria-hidden />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function HeroIllustration() {
  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-background/5 ring-1 ring-background/10">
      {/* Placeholder graphic — replace with branded illustration */}
      <div className="absolute inset-0 bg-gradient-to-br from-background/10 via-background/5 to-transparent" aria-hidden />
      <svg
        viewBox="0 0 400 300"
        className="absolute inset-0 h-full w-full"
        aria-hidden
      >
        <rect x="40" y="60" width="320" height="180" rx="14" fill="rgba(255,255,255,0.08)" />
        <rect x="60" y="80" width="170" height="12" rx="6" fill="rgba(255,255,255,0.18)" />
        <rect x="60" y="104" width="120" height="8" rx="4" fill="rgba(255,255,255,0.12)" />
        <rect x="60" y="130" width="280" height="60" rx="8" fill="rgba(255,255,255,0.06)" />
        <rect x="60" y="200" width="80" height="22" rx="11" fill="rgba(255,255,255,0.22)" />
        <circle cx="320" cy="80" r="22" fill="rgba(255,255,255,0.18)" />
        <circle cx="320" cy="80" r="10" fill="rgba(255,255,255,0.35)" />
      </svg>
      <div className="absolute bottom-3 right-4 text-[10px] uppercase tracking-wide text-background/40">
        Platzhalter
      </div>
    </div>
  );
}
