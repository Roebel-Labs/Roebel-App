import type { Metadata } from "next";
import type React from "react";

export const metadata: Metadata = {
  title: "Sommer Camp – Mini-App Hackathon | Röbel App",
  description:
    "Baue Apps für Röbel. Gewinne Preise — 6 Wochen-Runden, die ganzen Sommerferien lang. Jede Woche startet freitags um 18 Uhr eine neue Runde. Mit KI, ohne Vorwissen. Jetzt mitmachen!",
  openGraph: {
    title: "Sommer Camp – Mini-App Hackathon",
    description:
      "Baue Apps für Röbel. Gewinne Preise — jede Woche eine neue Runde, die ganzen Sommerferien. Jetzt mitmachen!",
    type: "website",
  },
};

export default function SommercampLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
