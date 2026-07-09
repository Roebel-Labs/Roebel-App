"use client";

// Content sections of the /sommercamp landing page. Every component takes
// `night` and renders the roll-up-matching palette for that mode.
import Image from "next/image";
import { Play } from "lucide-react";

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
    img: "/illustration/sommercamp/01.png",
    width: 550,
    height: 460,
    title: "Mit KI bauen",
    text: "Du beschreibst deine Idee, die KI baut mit — direkt im Browser, im KI-Baukasten der Röbel App.",
  },
  {
    img: "/illustration/sommercamp/02.png",
    width: 245,
    height: 245,
    title: "Echt in der App",
    text: "Deine Mini-App läuft am Ende live in der Röbel App — für alle in Röbel sichtbar.",
  },
  {
    img: "/illustration/sommercamp/03.png",
    width: 480,
    height: 460,
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
          Ein Hackathon für Röbel: Jede Woche baust du deine eigene Mini-App —
          allein oder mit Freunden, zu Hause oder beim Kickoff in der Schule.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {PILLARS.map(({ img, width, height, title, text }) => (
            <div
              key={title}
              className={`rounded-2xl p-5 text-center ${
                night ? "bg-white/5" : "border border-[#DFE6EF] bg-white"
              }`}
            >
              <div className="flex h-32 items-center justify-center sm:h-36">
                <Image
                  src={img}
                  alt=""
                  width={width}
                  height={height}
                  className="max-h-full w-auto object-contain"
                />
              </div>
              <h3 className="font-heading mt-4 text-xl font-black uppercase tracking-tight sm:text-2xl">
                {title}
              </h3>
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

// Siegertreppchen: 2. Platz links, 1. Platz erhöht in der Mitte, 3. rechts.
const PODIUM = [
  { place: "2", label: "2. Platz", amount: "50 €", bar: "h-32 sm:h-40" },
  { place: "1", label: "1. Platz", amount: "100 €", bar: "h-48 sm:h-60" },
  { place: "3", label: "3. Platz", amount: "50 €", bar: "h-24 sm:h-32" },
] as const;

export function PreiseSection({ night }: SectionProps) {
  const barColor = (place: string) => {
    if (place === "1") return "bg-[#FDC705] text-[#051433] shadow-lg";
    if (place === "2")
      return night ? "bg-white/15 text-white" : "bg-[#E3E5E9] text-[#051433]";
    return night ? "bg-white/10 text-white" : "bg-[#7BBBF2] text-[#051433]";
  };

  return (
    <section className={night ? "bg-[#0E1A38]" : "bg-white"}>
      <div className="mx-auto max-w-3xl px-4 py-14 sm:py-16">
        <SectionTitle night={night}>Das gibt&apos;s zu gewinnen</SectionTitle>
        <p className={`mt-3 text-sm leading-relaxed ${night ? "text-[#9DB4D0]" : "text-[#3D4E68]"}`}>
          Jede Woche ein neues Treppchen: Die Jury kürt jeden Freitag die besten
          drei Apps der Woche.
        </p>
        <div className="mx-auto mt-10 flex max-w-lg items-end justify-center gap-3 sm:gap-4">
          {PODIUM.map(({ place, label, amount, bar }) => (
            <div key={place} className="flex flex-1 flex-col items-center">
              <p
                className={`font-heading text-2xl font-black sm:text-3xl ${
                  place === "1"
                    ? night
                      ? "text-[#FDC705]"
                      : "text-[#00498B]"
                    : night
                      ? "text-white"
                      : "text-[#12203A]"
                }`}
              >
                {amount}
              </p>
              <p className={`mb-2 mt-0.5 text-[11px] font-bold uppercase tracking-wider ${night ? "text-[#9DB4D0]" : "text-[#6B7280]"}`}>
                pro Woche
              </p>
              <div
                className={`flex w-full flex-col items-center rounded-t-2xl pt-4 ${bar} ${barColor(place)}`}
              >
                <span className="font-heading text-4xl font-black leading-none sm:text-5xl">
                  {place}
                </span>
                <span className="mt-1 text-[11px] font-bold uppercase tracking-widest opacity-70">
                  Platz
                </span>
              </div>
            </div>
          ))}
        </div>
        <div className={`h-1 w-full max-w-lg rounded-full mx-auto ${night ? "bg-white/20" : "bg-[#DFE6EF]"}`} />
        <p className={`mt-5 text-center text-xs ${night ? "text-[#9DB4D0]" : "text-[#6B7280]"}`}>
          Siegerehrung jeden Freitag um 18&nbsp;Uhr — 6 Wochen lang.
        </p>
      </div>
    </section>
  );
}

// 6 Wochen-Runden (Cohorts) über die kompletten Sommerferien in MV.
// Jede Runde startet freitags 18 Uhr; die Siegerehrung ist am Freitag darauf.
const COHORTS: ReadonlyArray<{
  week: number;
  start: string;
  finale: string;
  note?: string;
}> = [
  { week: 1, start: "Fr 10.07.", finale: "Fr 17.07.", note: "Kickoff an der Schule Röbel" },
  { week: 2, start: "Fr 17.07.", finale: "Fr 24.07." },
  { week: 3, start: "Fr 24.07.", finale: "Fr 31.07." },
  { week: 4, start: "Fr 31.07.", finale: "Fr 07.08." },
  { week: 5, start: "Fr 07.08.", finale: "Fr 14.08." },
  { week: 6, start: "Fr 14.08.", finale: "Fr 21.08." },
];

export function AblaufSection({ night }: SectionProps) {
  return (
    <section className={night ? "bg-[#101F42]" : "bg-[#F4F7FB]"}>
      <div className="mx-auto max-w-3xl px-4 py-14 sm:py-16">
        <SectionTitle night={night}>Ablauf</SectionTitle>
        <p className={`mt-3 max-w-xl text-sm leading-relaxed ${night ? "text-[#9DB4D0]" : "text-[#3D4E68]"}`}>
          Das Sommer Camp läuft in 6 Wochen-Runden — die kompletten
          Sommerferien in Mecklenburg-Vorpommern. Jede Runde startet freitags
          um 18&nbsp;Uhr, am Freitag darauf kürt die Jury die besten drei der
          Woche. Du kannst jede Woche neu einsteigen.
        </p>
        <ol className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {COHORTS.map(({ week, start, finale, note }) => (
            <li
              key={week}
              className={`flex flex-col rounded-2xl p-4 ${
                night ? "bg-white/5" : "border border-[#DFE6EF] bg-white"
              }`}
            >
              <span
                className={`font-mono text-[11px] font-bold tracking-widest ${
                  night ? "text-[#FFD84D]" : "text-[#00498B]"
                }`}
              >
                WOCHE {week}
              </span>
              <span className="mt-1.5 text-sm font-bold">
                {start} <span aria-hidden>→</span> {finale}
              </span>
              <span className={`mt-1 text-xs leading-relaxed ${night ? "text-[#9DB4D0]" : "text-[#6B7280]"}`}>
                {note ?? "Siegerehrung: 1., 2. & 3. Platz"}
              </span>
            </li>
          ))}
        </ol>
        <p className={`mt-4 text-center text-xs ${night ? "text-[#9DB4D0]" : "text-[#6B7280]"}`}>
          Start &amp; Siegerehrung: immer freitags um 18&nbsp;Uhr.
        </p>
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
    a: "Jeden Freitag schaut sich die Jury alle Apps der Woche an und kürt die besten drei. Es zählen Kreativität, Nutzen für Röbel und Umsetzung.",
  },
  {
    q: "Muss ich die ganze Woche dabei sein?",
    a: "Nein. Nach dem Start am Freitag um 18 Uhr baust du, wann du willst. Zur Siegerehrung deiner Woche solltest du kommen — da wird deine App gezeigt.",
  },
  {
    q: "Kann ich auch später einsteigen?",
    a: "Ja. Das Camp läuft 6 Wochen, die ganzen Sommerferien. Jede Woche startet freitags um 18 Uhr eine neue Runde — mit eigenem 1., 2. und 3. Platz.",
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
