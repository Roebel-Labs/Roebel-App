// Download page for Ortis Studio, the desktop livestream studio (apps/studio).
import type { Metadata } from "next";
import Image from "next/image";
import { getStudioRelease } from "@/lib/studio/release";
import { DownloadButtons } from "./DownloadButtons";

export const metadata: Metadata = {
  title: "Ortis Studio – Livestream-Studio für Vereine | Röbel App",
  description:
    "Ortis Studio: Kameras umschalten, Bauchbinden und Ergebnisse einblenden, Werbepausen fahren und gleichzeitig in die Röbel App, auf YouTube und Facebook senden. Für macOS und Windows.",
};

const FEATURES: { title: string; text: string }[] = [
  {
    title: "Mehrere Kameras",
    text: "Webcams, iPhone per Integrationskamera, DJI Osmo Pocket oder eine Kamera über Capture-Karte. Umschalten mit einem Klick oder per Taste.",
  },
  {
    title: "Bauchbinden & Tabellen",
    text: "Namen, Startnummern und Ergebnisse aus einer Tabelle direkt ins Bild. Eine Korrektur gilt sofort in jeder Einblendung.",
  },
  {
    title: "Werbepausen",
    text: "Sponsorenlogos, Bilder und Videos in der Pause, mit Protokoll, wann welcher Sponsor zu sehen war.",
  },
  {
    title: "Überall gleichzeitig senden",
    text: "In die Röbel App, auf YouTube und auf Facebook in einem Durchgang. Ein Ziel hängt? Die anderen laufen weiter.",
  },
  {
    title: "Live-Raum der Röbel App",
    text: "Chat-Nachrichten ins Bild holen, Unterstützungen im Blick behalten. Sie erscheinen nie im Stream.",
  },
  {
    title: "Aufnahme auf dem Rechner",
    text: "Jede Sendung wird zusätzlich lokal gespeichert, auch wenn das Internet kurz weg ist.",
  },
];

export const revalidate = 300;

export default async function StudioPage() {
  const release = await getStudioRelease();
  return (
    <main className="min-h-screen bg-background px-4 py-16 text-foreground">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center gap-3">
          <Image src="/studio/ortis-icon.svg" alt="" width={40} height={40} unoptimized />
          <p className="text-sm font-semibold uppercase tracking-wide text-[#00498B] dark:text-[#7ABBF2]">Ortis Studio</p>
        </div>
        <h1 className="mt-4 font-heading text-4xl font-bold leading-tight md:text-5xl">
          Das Livestream-Studio für deine Veranstaltung.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
          Kameras, Einblendungen, Werbung und Sendeziele in einer App. Gebaut für Turniere, Feste und Vereine,
          zuerst beim DanceCup in Röbel.
        </p>

        <DownloadButtons downloads={release.downloads} />

        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-[4px] border border-[#B4B8C1] p-5 dark:border-[#3A3B3E]">
              <h2 className="text-lg font-semibold">{f.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>

        <section className="mt-14 rounded-[4px] border border-[#B4B8C1] p-6 dark:border-[#3A3B3E]">
          <h2 className="font-heading text-2xl font-bold">Erster Start</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Ortis Studio ist noch nicht bei Apple und Microsoft registriert. Dein System fragt deshalb beim ersten
            Öffnen nach.
          </p>
          <div className="mt-4 grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="font-semibold">macOS</h3>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                <li>DMG öffnen und Ortis Studio in den Ordner „Programme“ ziehen.</li>
                <li>Ortis Studio öffnen. Erscheint eine Warnung: „Fertig“ wählen.</li>
                <li>
                  Systemeinstellungen → Datenschutz &amp; Sicherheit → bei Ortis Studio „Trotzdem öffnen“ klicken.
                </li>
                <li>Kamera und Mikrofon erlauben, wenn gefragt.</li>
              </ol>
            </div>
            <div>
              <h3 className="font-semibold">Windows</h3>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                <li>Installationsdatei starten.</li>
                <li>Zeigt Windows „Der Computer wurde durch Windows geschützt“: „Weitere Informationen“ → „Trotzdem ausführen“.</li>
                <li>Installation durchklicken. Ortis Studio liegt danach auf dem Desktop und im Startmenü.</li>
              </ol>
            </div>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Eine Anleitung für die erste Sendung findest du in der App im Tab „Hilfe“.
          </p>
        </section>

        <p className="mt-10 text-xs text-muted-foreground">
          Version {release.version} · Quelloffen ·{" "}
          <a href="https://github.com/Roebel-Labs/Roebel-App/tree/main/apps/studio" className="underline">
            Quellcode
          </a>
          {release.downloads.filter((d) => d.sha256).map((d) => (
            <span key={d.os} className="block break-all">
              SHA-256 {d.os === "mac" ? "macOS" : "Windows"}: {d.sha256}
            </span>
          ))}
        </p>
      </div>
    </main>
  );
}
