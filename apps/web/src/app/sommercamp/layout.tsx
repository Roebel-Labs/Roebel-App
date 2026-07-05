import type { Metadata } from "next";
import type React from "react";

export const metadata: Metadata = {
  title: "Sommer Camp – Mini-App Hackathon | Röbel App",
  description:
    "Baue Apps für Röbel und gewinne 100 € — Mini-App Hackathon vom 10. bis 17. Juli an der Schule Röbel. Mit KI, ohne Vorwissen. Jetzt mitmachen!",
  openGraph: {
    title: "Sommer Camp – Mini-App Hackathon",
    description:
      "Baue Apps für Röbel und gewinne 100 € — 10. bis 17. Juli, Schule Röbel. Jetzt mitmachen!",
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
