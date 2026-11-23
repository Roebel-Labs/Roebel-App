// Landing page after a Google or Microsoft connection started from Ortis Studio
// (?google=ok|cancelled|error or ?microsoft=ok|cancelled|error|admin). It hands control straight
// back to the desktop app via its URL scheme (ortis-studio://), the native-app OAuth pattern
// (RFC 8252): Google and Microsoft forbid or discourage sign-in inside embedded app windows.
import type { Metadata } from "next";
import { BackToStudio } from "./BackToStudio";

export const metadata: Metadata = { title: "Verbindung | Ortis Studio", robots: { index: false } };

type Provider = "Google" | "Microsoft";

function text(provider: Provider, key: string): { title: string; body: string } {
  const what = provider === "Google" ? "Kalender und E-Mail" : "Outlook-Mail und -Kalender";
  switch (key) {
    case "ok":
      return { title: `${provider} ist verbunden`, body: `Ortis Studio öffnet sich gleich wieder. ${what} stehen deinen Assistenten jetzt zur Verfügung.` };
    case "cancelled":
      return { title: "Verbindung abgebrochen", body: `Du hast die ${provider}-Anmeldung abgebrochen. In Ortis Studio kannst du es jederzeit erneut versuchen.` };
    case "admin":
      return {
        title: "Freigabe durch eure IT nötig",
        body: "Eure Organisation erlaubt nicht, dass Mitarbeitende Apps selbst freigeben. Bitte die Person, die euer Microsoft 365 verwaltet, Ortis einmal freizugeben. Den Freigabe-Link findest du in Ortis Studio unter Einstellungen → Verbindungen.",
      };
    default:
      return { title: "Das hat nicht geklappt", body: `Die Verbindung zu ${provider} konnte nicht hergestellt werden. Bitte versuche es in Ortis Studio noch einmal.` };
  }
}

const KEYS = ["ok", "cancelled", "error", "admin"];

export default async function Page({ searchParams }: { searchParams: Promise<{ google?: string; microsoft?: string }> }) {
  const { google, microsoft } = await searchParams;
  const provider: Provider = microsoft ? "Microsoft" : "Google";
  const raw = microsoft ?? google;
  const key = raw && KEYS.includes(raw) ? raw : "error";
  const t = text(provider, key);
  return (
    <main className="min-h-screen bg-white px-4 py-16 text-gray-900">
      <div className="mx-auto max-w-md">
        <h1 className="font-heading text-2xl font-bold">{t.title}</h1>
        <p className="mt-3 text-gray-600">{t.body}</p>
        {/* The desktop shell accepts only ok|cancelled|error; it just refreshes the connections list. */}
        <BackToStudio result={key === "admin" ? "error" : key} />
      </div>
    </main>
  );
}
