"use client";

// Landing page for the Sommer Camp Mini-App Hackathon (10.–17. Juli 2026,
// Schule Röbel). The printed roll-ups exist in a day and a night variant —
// this page mirrors both: time of day picks the default, a sun/moon toggle
// overrides it (persisted per browser).
import { useEffect, useState } from "react";
import Link from "next/link";
import { Moon, Sun } from "lucide-react";
import { RegistrationCard } from "./RegistrationCard";
import {
  AblaufSection,
  FaqSection,
  PreiseSection,
  VideoSection,
  WasIstDasSection,
} from "./sections";

const MODE_KEY = "sommercamp-mode";
type Mode = "day" | "night";

function defaultModeForHour(hour: number): Mode {
  return hour >= 6 && hour < 20 ? "day" : "night";
}

// Static, subtle star field for the night sky (no motion — calm by default).
const STARS = {
  backgroundImage: [
    "radial-gradient(1px 1px at 12% 22%, rgba(255,255,255,.9) 50%, transparent 51%)",
    "radial-gradient(1px 1px at 28% 8%, rgba(255,255,255,.6) 50%, transparent 51%)",
    "radial-gradient(1.5px 1.5px at 41% 31%, rgba(255,216,77,.9) 50%, transparent 51%)",
    "radial-gradient(1px 1px at 57% 12%, rgba(255,255,255,.7) 50%, transparent 51%)",
    "radial-gradient(1px 1px at 66% 27%, rgba(255,255,255,.5) 50%, transparent 51%)",
    "radial-gradient(1.5px 1.5px at 78% 7%, rgba(255,255,255,.8) 50%, transparent 51%)",
    "radial-gradient(1px 1px at 89% 19%, rgba(255,216,77,.7) 50%, transparent 51%)",
    "radial-gradient(1px 1px at 8% 44%, rgba(255,255,255,.5) 50%, transparent 51%)",
    "radial-gradient(1px 1px at 94% 39%, rgba(255,255,255,.6) 50%, transparent 51%)",
  ].join(", "),
} as const;

export function SommercampPage() {
  const [mode, setMode] = useState<Mode>("day");

  useEffect(() => {
    const stored = window.localStorage.getItem(MODE_KEY);
    if (stored === "day" || stored === "night") {
      setMode(stored);
    } else {
      setMode(defaultModeForHour(new Date().getHours()));
    }
  }, []);

  const toggleMode = () => {
    const next: Mode = mode === "day" ? "night" : "day";
    setMode(next);
    window.localStorage.setItem(MODE_KEY, next);
  };

  const night = mode === "night";

  return (
    <div
      data-mode={mode}
      className={night ? "bg-[#0E1A38] text-[#E6EEFA]" : "bg-white text-[#12203A]"}
    >
      {/* Tag/Nacht-Umschalter */}
      <button
        type="button"
        onClick={toggleMode}
        aria-pressed={night}
        aria-label={night ? "Tag-Ansicht einschalten" : "Nacht-Ansicht einschalten"}
        className={`fixed top-4 right-4 z-50 flex h-10 w-10 items-center justify-center rounded-full border shadow-sm backdrop-blur transition-colors ${
          night
            ? "border-white/20 bg-white/10 text-[#FFD84D] hover:bg-white/20"
            : "border-black/10 bg-white/70 text-[#00498B] hover:bg-white"
        }`}
      >
        {night ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </button>

      {/* Hero — der Roll-Up-Himmel */}
      <header
        className={`relative overflow-hidden ${
          night
            ? "bg-gradient-to-b from-[#0B1530] via-[#12234A] to-[#2C4A7A]"
            : "bg-gradient-to-b from-[#F5D96B] via-[#A9C9EE] to-[#EAF2FB]"
        }`}
      >
        {night && (
          <div aria-hidden className="absolute inset-0" style={STARS} />
        )}
        <div className="relative mx-auto flex max-w-3xl flex-col items-center px-4 pb-16 pt-20 text-center sm:pb-20 sm:pt-24">
          <span
            className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold tracking-widest ${
              night ? "bg-white/10 text-white" : "bg-white text-[#12203A]"
            }`}
          >
            RÖBEL APP
          </span>
          <h1
            className={`font-heading mt-6 text-6xl font-black uppercase leading-[0.9] tracking-tight sm:text-8xl ${
              night ? "text-white" : "text-[#12203A]"
            }`}
          >
            Sommer
            <br />
            Camp
          </h1>
          <p
            className={`mt-4 text-lg font-semibold ${
              night ? "text-[#CFE2F5]" : "text-[#12203A]"
            }`}
          >
            Mini-App Hackathon
          </p>
          <span
            className={`mt-4 rounded-full px-5 py-1.5 font-mono text-sm font-bold tracking-wider ${
              night ? "bg-[#9CC4EA] text-[#0E2A47]" : "bg-[#FFD84D] text-[#0E2A47]"
            }`}
          >
            10. JULI – 17. JULI
          </span>
          <p className="mt-6 max-w-md text-xl font-semibold leading-snug">
            Baue Apps für Röbel und gewinne{" "}
            <span className={night ? "text-[#FFD84D]" : "text-[#00498B]"}>
              100&nbsp;€
            </span>
          </p>
          <p
            className={`mt-3 max-w-md text-sm leading-relaxed ${
              night ? "text-[#9DB4D0]" : "text-[#3D4E68]"
            }`}
          >
            Eine Woche, deine Idee, eine echte Mini-App in der Röbel App — gebaut
            mit KI, ganz ohne Vorwissen.
          </p>
          <a
            href="#mitmachen"
            className={`mt-8 rounded-full px-8 py-3.5 text-sm font-bold shadow-lg transition-transform hover:scale-[1.03] ${
              night
                ? "bg-[#FFD84D] text-[#0E2A47]"
                : "bg-[#00498B] text-white"
            }`}
          >
            Jetzt mitmachen
          </a>
        </div>
      </header>

      <main>
        <VideoSection night={night} />
        <WasIstDasSection night={night} />
        <PreiseSection night={night} />
        <AblaufSection night={night} />

        {/* Anmeldung — nachts läuft der Himmel ins Gold (rechtes Roll-Up) */}
        <section
          id="mitmachen"
          className={
            night
              ? "bg-gradient-to-b from-[#101F42] via-[#3D5A8A] to-[#F5D96B]"
              : "bg-[#00498B]"
          }
        >
          <div className="mx-auto max-w-xl px-4 py-14 sm:py-16">
            <h2 className="font-heading text-center text-3xl font-black uppercase tracking-tight text-white">
              Anmeldung
            </h2>
            <p className="mt-2 text-center text-sm text-white/80">
              Kostenlos. Dauert eine Minute — danach geht&apos;s direkt in den
              KI-Baukasten.
            </p>
            <div className="mt-8">
              <RegistrationCard night={night} />
            </div>
          </div>
        </section>

        <FaqSection night={night} />
      </main>

      <footer
        className={`px-4 py-10 text-center text-xs ${
          night ? "bg-[#0B1530] text-[#9DB4D0]" : "bg-[#F4F7FB] text-[#6B7280]"
        }`}
      >
        <p className="font-semibold">Röbel App · Sommer Camp 2026</p>
        <nav className="mt-3 flex items-center justify-center gap-4">
          <Link href="/impressum" className="hover:underline">
            Impressum
          </Link>
          <Link href="/datenschutz" className="hover:underline">
            Datenschutz
          </Link>
          <Link href="/agb" className="hover:underline">
            AGB
          </Link>
        </nav>
      </footer>
    </div>
  );
}
