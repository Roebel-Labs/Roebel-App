// Landing page after a Google connection started from Ortis Studio (?google=ok|cancelled|error).
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Verbindung | Ortis Studio", robots: { index: false } };

const TEXT: Record<string, { title: string; body: string }> = {
  ok: { title: "Google ist verbunden", body: "Du kannst dieses Fenster schließen und zu Ortis Studio zurückgehen. Kalender und E-Mail stehen deinen Assistenten jetzt zur Verfügung." },
  cancelled: { title: "Verbindung abgebrochen", body: "Du hast die Google-Anmeldung abgebrochen. In Ortis Studio kannst du es jederzeit erneut versuchen." },
  error: { title: "Das hat nicht geklappt", body: "Die Verbindung zu Google konnte nicht hergestellt werden. Bitte versuche es in Ortis Studio noch einmal." },
};

export default async function Page({ searchParams }: { searchParams: Promise<{ google?: string }> }) {
  const { google } = await searchParams;
  const t = TEXT[google ?? ""] ?? TEXT.error;
  return (
    <main className="min-h-screen bg-white px-4 py-16 text-gray-900">
      <div className="mx-auto max-w-md">
        <h1 className="font-heading text-2xl font-bold">{t.title}</h1>
        <p className="mt-3 text-gray-600">{t.body}</p>
      </div>
    </main>
  );
}
