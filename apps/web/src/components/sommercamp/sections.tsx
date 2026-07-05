"use client";

// Content sections of the /sommercamp landing page. Every component takes
// `night` and renders the roll-up-matching palette for that mode.
import { Play, Sparkles, Smartphone, GraduationCap } from "lucide-react";

// YouTube-ID des Intro-Videos — eintragen, sobald das Video hochgeladen ist.
export const SOMMERCAMP_VIDEO_ID = "";

type SectionProps = { night: boolean };

function SectionTitle({ night, children }: SectionProps & { children: React.ReactNode }) {
  return (
    <h2
      className={`font-heading text-3xl font-black uppercase tracking-tight ${
        night ? "text-white" : "text-[#12203A]"
      }`}
    >
      {children}
    </h2>
  );
}

export function VideoSection({ night }: SectionProps) {
  return (
    <section className={night ? "bg-[#0E1A38]" : "bg-white"}>
      <div className="mx-auto max-w-3xl px-4 py-14 sm:py-16">
        <SectionTitle night={night}>So funktioniert&apos;s</SectionTitle>
        <div
          className={`mt-6 flex aspect-video w-full items-center justify-center overflow-hidden rounded-2xl ${
            night ? "bg-white/5" : "bg-[#12203A]"
          }`}
        >
          {SOMMERCAMP_VIDEO_ID ? (
            <iframe
              className="h-full w-full"
              src={`https://www.youtube-nocookie.com/embed/${SOMMERCAMP_VIDEO_ID}`}
              title="Sommer Camp – Intro-Video"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <div className="flex flex-col items-center gap-3 text-center">
              <span
                className={`flex h-14 w-14 items-center justify-center rounded-full ${
                  night ? "bg-white/10 text-[#FFD84D]" : "bg-white/10 text-white"
                }`}
              >
                <Play className="ml-0.5 h-6 w-6" />
              </span>
              <p className={`text-sm ${night ? "text-[#9DB4D0]" : "text-white/70"}`}>
                Das Intro-Video folgt in Kürze.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

const PILLARS = [
  {
    icon: Sparkles,
    title: "Mit KI bauen",
    text: "Du beschreibst deine Idee, die KI baut mit — direkt im Browser, im KI-Baukasten der Röbel App.",
  },
  {
    icon: Smartphone,
    title: "Echt in der App",
    text: "Deine Mini-App läuft am Ende live in der Röbel App — für alle in Röbel sichtbar.",
  },
  {
    icon: GraduationCap,
    title: "Ohne Vorwissen",
    text: "Kein Code, keine Installation. Neugier reicht — den Rest zeigen wir dir beim Kickoff.",
  },
] as const;

export function WasIstDasSection({ night }: SectionProps) {
  return (
    <section className={night ? "bg-[#101F42]" : "bg-[#F4F7FB]"}>
      <div className="mx-auto max-w-3xl px-4 py-14 sm:py-16">
        <SectionTitle night={night}>Was ist das Sommer Camp?</SectionTitle>
        <p className={`mt-3 max-w-xl text-sm leading-relaxed ${night ? "text-[#9DB4D0]" : "text-[#3D4E68]"}`}>
          Ein Hackathon für Röbel: Eine Woche lang baust du deine eigene Mini-App
          — allein oder mit Freunden, zu Hause oder beim Kickoff in der Schule.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {PILLARS.map(({ icon: Icon, title, text }) => (
            <div
              key={title}
              className={`rounded-2xl p-5 ${
                night ? "bg-white/5" : "border border-[#DFE6EF] bg-white"
              }`}
            >
              <Icon className={`h-6 w-6 ${night ? "text-[#FFD84D]" : "text-[#00498B]"}`} />
              <h3 className="mt-3 font-bold">{title}</h3>
              <p className={`mt-1.5 text-sm leading-relaxed ${night ? "text-[#9DB4D0]" : "text-[#3D4E68]"}`}>
                {text}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const PRIZES = [
  { place: "1. Platz", amount: "100 €", first: true },
  { place: "2. Platz", amount: "50 €", first: false },
  { place: "3. Platz", amount: "50 €", first: false },
] as const;

export function PreiseSection({ night }: SectionProps) {
  return (
    <section className={night ? "bg-[#0E1A38]" : "bg-white"}>
      <div className="mx-auto max-w-3xl px-4 py-14 sm:py-16">
        <SectionTitle night={night}>Das gibt&apos;s zu gewinnen</SectionTitle>
        <div className="mt-8 grid grid-cols-3 gap-3 sm:gap-4">
          {PRIZES.map(({ place, amount, first }) => (
            <div
              key={place}
              className={`rounded-2xl p-4 text-center sm:p-6 ${
                first
                  ? "-translate-y-1 bg-[#FFD84D] text-[#0E2A47] shadow-lg"
                  : night
                    ? "bg-white/5 text-white"
                    : "border border-[#DFE6EF] bg-white text-[#12203A]"
              }`}
            >
              <p className={`text-xs font-bold uppercase tracking-wider ${first ? "text-[#0E2A47]/70" : night ? "text-[#9DB4D0]" : "text-[#6B7280]"}`}>
                {place}
              </p>
              <p className="font-heading mt-1 text-3xl font-black sm:text-4xl">{amount}</p>
            </div>
          ))}
        </div>
        <p className={`mt-4 text-center text-xs ${night ? "text-[#9DB4D0]" : "text-[#6B7280]"}`}>
          Die Jury kürt die Gewinner beim Finale am 17. Juli.
        </p>
      </div>
    </section>
  );
}

const SCHEDULE = [
  {
    date: "FR 10. JULI",
    title: "Kickoff an der Schule Röbel",
    text: "Wir zeigen dir den KI-Baukasten und du startest deine erste Mini-App. Uhrzeit folgt.",
  },
  {
    date: "10. – 17. JULI",
    title: "Bauwoche",
    text: "Bau, wann du Zeit hast — zu Hause oder unterwegs. Bei Fragen helfen wir dir.",
  },
  {
    date: "FR 17. JULI",
    title: "Finale & Siegerehrung",
    text: "Alle Apps werden gezeigt, die Jury kürt die besten drei. Uhrzeit folgt.",
  },
] as const;

export function AblaufSection({ night }: SectionProps) {
  return (
    <section className={night ? "bg-[#101F42]" : "bg-[#F4F7FB]"}>
      <div className="mx-auto max-w-3xl px-4 py-14 sm:py-16">
        <SectionTitle night={night}>Ablauf</SectionTitle>
        <ol className="mt-8 space-y-3">
          {SCHEDULE.map(({ date, title, text }) => (
            <li
              key={date}
              className={`flex flex-col gap-1 rounded-2xl p-5 sm:flex-row sm:items-baseline sm:gap-6 ${
                night ? "bg-white/5" : "border border-[#DFE6EF] bg-white"
              }`}
            >
              <span
                className={`shrink-0 font-mono text-xs font-bold tracking-wider sm:w-28 ${
                  night ? "text-[#FFD84D]" : "text-[#00498B]"
                }`}
              >
                {date}
              </span>
              <div>
                <h3 className="font-bold">{title}</h3>
                <p className={`mt-1 text-sm leading-relaxed ${night ? "text-[#9DB4D0]" : "text-[#3D4E68]"}`}>
                  {text}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

const FAQS = [
  {
    q: "Wer kann mitmachen?",
    a: "Alle aus Röbel und Umgebung — besonders Schülerinnen und Schüler. Du kannst allein oder mit Freunden bauen.",
  },
  {
    q: "Brauche ich Programmier-Erfahrung?",
    a: "Nein. Im KI-Baukasten beschreibst du deine Idee in normalen Sätzen, die KI baut die App. Beim Kickoff zeigen wir dir alles.",
  },
  {
    q: "Was brauche ich?",
    a: "Ein Handy, Tablet oder einen Laptop mit Browser — mehr nicht. Die Teilnahme ist kostenlos.",
  },
  {
    q: "Wie werden die Gewinner ermittelt?",
    a: "Beim Finale am 17. Juli schaut sich die Jury alle Apps an. Zählen Kreativität, Nutzen für Röbel und Umsetzung.",
  },
  {
    q: "Muss ich die ganze Woche dabei sein?",
    a: "Nein. Nach dem Kickoff baust du, wann du willst. Nur zum Finale solltest du kommen — da wird deine App gezeigt.",
  },
] as const;

export function FaqSection({ night }: SectionProps) {
  return (
    <section className={night ? "bg-[#0E1A38]" : "bg-white"}>
      <div className="mx-auto max-w-3xl px-4 py-14 sm:py-16">
        <SectionTitle night={night}>Fragen &amp; Antworten</SectionTitle>
        <div className="mt-6 space-y-2">
          {FAQS.map(({ q, a }) => (
            <details
              key={q}
              className={`group rounded-xl px-5 py-4 ${
                night ? "bg-white/5" : "border border-[#DFE6EF] bg-white"
              }`}
            >
              <summary className="cursor-pointer list-none font-semibold marker:hidden [&::-webkit-details-marker]:hidden">
                {q}
              </summary>
              <p className={`mt-2 text-sm leading-relaxed ${night ? "text-[#9DB4D0]" : "text-[#3D4E68]"}`}>
                {a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
