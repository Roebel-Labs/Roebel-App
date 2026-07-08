// /developers/mini-apps — the public developer page for the Netizen Mini App
// platform: the four ways to build (KI-Baukasten, Claude Code, Lovable, MCP),
// quickstart snippets, and links to the machine-readable docs (llms.txt).
// Server component, statically rendered.
import type { Metadata } from "next";
import Link from "next/link";
import { Blocks, Bot, FileCode2, Globe, Sparkles, TerminalSquare } from "lucide-react";
import { DOCS_BASE_URL } from "@/lib/miniapp/devdocs";
import { SDK_ESM_URL } from "@/lib/miniapp/ai/htmlPrompt";

export const metadata: Metadata = {
  title: "Mini Apps bauen — Röbel App",
  description:
    "Baue Mini-Apps für die Röbel App: mit dem KI-Baukasten, mit Claude Code, mit Lovable oder per MCP. SDK, Design-System und Veröffentlichung — alles offen.",
};

const LOVABLE_PROMPT = `Baue eine Mini-App für die Röbel App (Deutschland, deutsche UI-Texte).
Lies zuerst die Plattform-Doku: ${DOCS_BASE_URL}/mini-apps/llms-full.txt
Wichtig: npm-Paket @netizen-labs/miniapp-sdk installieren, sdk.actions.ready()
nach dem ersten Rendern aufrufen, niemals Wallet-Adressen oder Krypto-Jargon
zeigen (Währung heißt "Röbel-Münzen"). Außerhalb der Röbel App läuft das SDK
automatisch im Mock-Modus — die Vorschau hier funktioniert also ganz normal.
Die App: [BESCHREIBE DEINE IDEE]`;

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-[10px] border border-border bg-muted/50 p-3 font-mono text-xs leading-relaxed">
      {children}
    </pre>
  );
}

function Door({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[14px] border border-border bg-card p-5">
      <h2 className="mb-2 flex items-center gap-2 font-heading text-lg font-bold">
        <Icon className="h-5 w-5 text-primary" />
        {title}
      </h2>
      <div className="space-y-3 text-sm text-muted-foreground">{children}</div>
    </section>
  );
}

export default function MiniAppDevelopersPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-8">
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-[14px] bg-primary">
          <Blocks className="h-5 w-5 text-primary-foreground" />
        </div>
        <h1 className="font-heading text-3xl font-bold">Mini Apps für Röbel bauen</h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Eine Mini-App ist eine Web-App, die in der Röbel App läuft und über das Netizen SDK mit
          ihr spricht: Nutzer-Kontext, Wallet, Röbel-Münzen, Benachrichtigungen. Bau sie, womit du
          willst — vier Wege führen in den Store. Nach dem Einreichen prüft ein Admin jede App.
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          Für KI-Agenten:{" "}
          <a href="/mini-apps/llms.txt" className="font-mono text-primary hover:underline">
            /mini-apps/llms.txt
          </a>{" "}
          ·{" "}
          <a href="/mini-apps/llms-full.txt" className="font-mono text-primary hover:underline">
            /mini-apps/llms-full.txt
          </a>
        </p>
      </div>

      <div className="space-y-4">
        <Door icon={Sparkles} title="1 · KI-Baukasten (am schnellsten)">
          <p>
            Beschreibe deine Idee im Chat — oder lade ein Mockup, einen Screenshot oder ein Logo
            hoch. Die KI baut eine vollständige App im Röbel-Design, du testest sie live in der
            Vorschau (Element anklicken → gezielt ändern), veröffentlichst mit einem Klick.
          </p>
          <p>
            <Link href="/editor" className="font-medium text-primary hover:underline">
              → Zum KI-Baukasten
            </Link>
          </p>
        </Door>

        <Door icon={TerminalSquare} title="2 · Claude Code (volle Kontrolle, eine Datei)">
          <p>
            Lass Claude Code (oder jeden Agenten) eine selbstständige HTML-Datei bauen. Die
            komplette Anleitung — SDK, Design-System, Boilerplate — steckt in einer Datei, die dein
            Agent lesen kann:
          </p>
          <Code>{`Lies ${DOCS_BASE_URL}/mini-apps/llms-full.txt und baue mir eine
Röbel Mini-App als einzelne HTML-Datei: [DEINE IDEE]`}</Code>
          <p>
            Einreichen: im Dashboard unter{" "}
            <Link href="/dashboard/mini-apps/import" className="text-primary hover:underline">
              App importieren → HTML-Datei
            </Link>{" "}
            — oder direkt per MCP (unten). Gehostet wird sie von uns unter{" "}
            <span className="font-mono text-xs">roebel.app/mini/&lt;slug&gt;</span>.
          </p>
        </Door>

        <Door icon={Globe} title="3 · Lovable, v0 & Co. (gehostete Apps)">
          <p>
            Bau mit deinem Lieblings-Editor und hoste selbst (Lovable, Vercel, eigener Server).
            Das SDK kommt von npm; außerhalb der Röbel App läuft es im <b>Mock-Modus</b> — deine
            App bleibt in jeder Vorschau voll bedienbar.
          </p>
          <Code>{`npm i @netizen-labs/miniapp-sdk`}</Code>
          <p>Prompt zum Einfügen in Lovable:</p>
          <Code>{LOVABLE_PROMPT}</Code>
          <p>
            Wichtig: Deine Seite muss einbettbar sein (Header{" "}
            <span className="font-mono text-xs">frame-ancestors *</span>, kein{" "}
            <span className="font-mono text-xs">X-Frame-Options: DENY</span>). Dann die URL unter{" "}
            <Link href="/dashboard/mini-apps/import" className="text-primary hover:underline">
              App importieren → Gehostete URL
            </Link>{" "}
            einreichen — wir prüfen die Einbettbarkeit automatisch.
          </p>
        </Door>

        <Door icon={Bot} title="4 · MCP-Server (für alle KI-Agenten)">
          <p>
            Der Netizen-MCP-Server macht die Plattform für jeden MCP-fähigen Agenten bedienbar:
            Doku lesen, HTML validieren, Apps auflisten, veröffentlichen, Analytics abrufen.
          </p>
          <Code>{`claude mcp add --transport http netizen ${DOCS_BASE_URL}/api/mcp \\
  --header "Authorization: Bearer nz_DEIN_KEY"`}</Code>
          <p>
            API-Key erstellen:{" "}
            <Link href="/dashboard/mini-apps/api" className="text-primary hover:underline">
              Dashboard → API & MCP
            </Link>
            . Werkzeuge: <span className="font-mono text-xs">get_started</span>,{" "}
            <span className="font-mono text-xs">get_docs</span>,{" "}
            <span className="font-mono text-xs">validate_html</span>,{" "}
            <span className="font-mono text-xs">publish_html_app</span>,{" "}
            <span className="font-mono text-xs">submit_external_app</span>,{" "}
            <span className="font-mono text-xs">list_my_apps</span>,{" "}
            <span className="font-mono text-xs">get_app_analytics</span> u. a.
          </p>
        </Door>

        <Door icon={FileCode2} title="Spielregeln (gelten für alle Wege)">
          <ul className="list-inside list-disc space-y-1">
            <li>
              <span className="font-mono text-xs">sdk.actions.ready()</span> nach dem ersten
              Rendern aufrufen — sonst bleibt der Lade-Splash stehen.
            </li>
            <li>Alle UI-Texte auf Deutsch; niemals rohe Wallet-Adressen zeigen.</li>
            <li>
              Die Währung heißt „Röbel-Münzen“ (RÖ) — niemals „CRC“, „Circles“ oder Krypto-Jargon.
            </li>
            <li>
              Belohnungen: max. 1 Münze pro Nutzer:in, App und Tag (serverseitig erzwungen) —
              immer <span className="font-mono text-xs">amount: 1</span> anfordern.
            </li>
            <li>Mobile-first (~360 px), Röbel-Design-System, Light + Dark Mode.</li>
            <li>
              SDK-Modul für Single-File-Apps:{" "}
              <span className="break-all font-mono text-xs">{SDK_ESM_URL}</span>
            </li>
          </ul>
        </Door>
      </div>
    </main>
  );
}
