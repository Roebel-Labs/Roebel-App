"use client";

// Content sections of the /sommercamp landing page. Every component takes
// `night` and renders the roll-up-matching palette for that mode.
import Image from "next/image";
import { Play } from "lucide-react";
import { Reveal } from "./Reveal";

// YouTube-ID des Intro-Videos (https://youtu.be/QKxNUsw_7CM).
export const SOMMERCAMP_VIDEO_ID = "QKxNUsw_7CM";

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
        <Reveal>
          <SectionTitle night={night}>So funktioniert&apos;s</SectionTitle>
        </Reveal>
        <Reveal
          delay={150}
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
        </Reveal>
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
        <Reveal>
          <SectionTitle night={night}>Was ist das Sommer Camp?</SectionTitle>
          <p className={`mt-3 max-w-xl text-sm leading-relaxed ${night ? "text-[#9DB4D0]" : "text-[#3D4E68]"}`}>
            Ein Hackathon für Röbel: Jede Woche baust du deine eigene Mini-App —
            allein oder mit Freunden, zu Hause oder beim Kickoff in der Schule.
          </p>
        </Reveal>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {PILLARS.map(({ img, width, height, title, text }, i) => (
            <Reveal key={title} delay={150 + i * 120} className="h-full">
              <div
                className={`h-full rounded-2xl p-5 text-center transition duration-300 hover:-translate-y-1 hover:shadow-md motion-reduce:transition-none ${
                  night ? "bg-white/5" : "border border-[#DFE6EF] bg-white"
                }`}
              >
                <div className="flex h-32 items-center justify-center sm:h-36">
                  <Image
                    src={img}
                    alt=""
                    width={width}
                    height={height}
                    className="max-h-full w-auto object-contain transition-transform duration-300 group-hover:scale-[1.04] motion-reduce:transition-none"
                  />
                </div>
                <h3 className="font-heading mt-4 text-xl font-black uppercase tracking-tight sm:text-2xl">
                  {title}
                </h3>
                <p className={`mt-1.5 text-sm leading-relaxed ${night ? "text-[#9DB4D0]" : "text-[#3D4E68]"}`}>
                  {text}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// Siegertreppchen: 2. Platz links, 1. Platz erhöht in der Mitte, 3. rechts.
// `delay` staffelt den Einzug in Zeremonie-Reihenfolge: erst 2, dann 3,
// Gold zuletzt.
const PODIUM = [
  { place: "2", amount: "60 €", bar: "h-32 sm:h-40", delay: 0 },
  { place: "1", amount: "120 €", bar: "h-48 sm:h-60", delay: 350 },
  { place: "3", amount: "60 €", bar: "h-24 sm:h-32", delay: 175 },
] as const;

export function PreiseSection({ night }: SectionProps) {
  const barColor = (place: string) => {
    if (place === "1") return "bg-[#FDC705] shadow-lg";
    if (place === "2") return night ? "bg-white/15" : "bg-[#E3E5E9]";
    return night ? "bg-white/10" : "bg-[#7BBBF2]";
  };
  const barText = (place: string) =>
    place !== "1" && night ? "text-white" : "text-[#051433]";

  return (
    <section className={night ? "bg-[#0E1A38]" : "bg-white"}>
      <div className="mx-auto max-w-3xl px-4 py-14 sm:py-16">
        <Reveal>
          <SectionTitle night={night}>Das gibt&apos;s zu gewinnen</SectionTitle>
          <p className={`mt-3 text-sm leading-relaxed ${night ? "text-[#9DB4D0]" : "text-[#3D4E68]"}`}>
            Jede Woche ein neues Treppchen: Die Jury kürt jeden Freitag die
            besten drei Apps der Woche.
          </p>
        </Reveal>
        <div className="mx-auto mt-10 flex max-w-lg items-end justify-center gap-3 sm:gap-4">
          {PODIUM.map(({ place, amount, bar, delay }) => (
            <Reveal key={place} delay={delay} className="flex flex-1 flex-col items-center self-end">
              <p
                className={`mb-2 font-heading text-2xl font-black sm:text-3xl ${
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
              {/* Balken wächst vom Boden, danach blendet die Platzierung ein */}
              <div className={`relative w-full ${bar}`}>
                <div
                  aria-hidden
                  style={{ transitionDelay: `${delay + 150}ms` }}
                  className={`absolute inset-0 origin-bottom scale-y-0 rounded-t-2xl transition-transform duration-700 ease-out group-data-[shown=true]:scale-y-100 motion-reduce:transition-none ${barColor(place)}`}
                />
                <div
                  style={{ transitionDelay: `${delay + 550}ms` }}
                  className={`relative flex flex-col items-center pt-4 opacity-0 transition-opacity duration-500 group-data-[shown=true]:opacity-100 motion-reduce:transition-none ${barText(place)}`}
                >
                  <span className="font-heading text-4xl font-black leading-none sm:text-5xl">
                    {place}
                  </span>
                  <span className="mt-1 text-[11px] font-bold uppercase tracking-widest opacity-70">
                    Platz
                  </span>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
        <div className={`mx-auto h-1 w-full max-w-lg rounded-full ${night ? "bg-white/20" : "bg-[#DFE6EF]"}`} />
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
        <Reveal>
          <SectionTitle night={night}>Ablauf</SectionTitle>
          <p className={`mt-3 max-w-xl text-sm leading-relaxed ${night ? "text-[#9DB4D0]" : "text-[#3D4E68]"}`}>
            Das Sommer Camp läuft in 6 Wochen-Runden — die kompletten
            Sommerferien in Mecklenburg-Vorpommern. Jede Runde startet freitags
            um 18&nbsp;Uhr, am Freitag darauf kürt die Jury die besten drei der
            Woche. Du kannst jede Woche neu einsteigen.
          </p>
        </Reveal>
        <ol className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {COHORTS.map(({ week, start, finale, note }, i) => (
            <li key={week} className="h-full">
              <Reveal delay={100 + i * 80} className="h-full">
                <div
                  className={`flex h-full flex-col rounded-2xl p-4 transition duration-300 hover:-translate-y-1 hover:shadow-md motion-reduce:transition-none ${
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
                </div>
              </Reveal>
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
        <Reveal>
          <SectionTitle night={night}>Fragen &amp; Antworten</SectionTitle>
        </Reveal>
        <Reveal delay={100} className="mt-6 space-y-2">
          {FAQS.map(({ q, a }) => (
            <details
              key={q}
              className={`rounded-xl px-5 py-4 transition-colors motion-reduce:transition-none ${
                night
                  ? "bg-white/5 hover:bg-white/10"
                  : "border border-[#DFE6EF] bg-white hover:border-[#B9C8DC]"
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
        </Reveal>
      </div>
    </section>
  );
}
