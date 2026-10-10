// Placeholder landing for the Röbel Mini Apps platform (spec 2026-10-10 §6).
// Also the target of the bare roebel.site redirect in next.config.mjs.
import type { Metadata } from "next";
import Link from "next/link";
import { DOCS_BASE_URL } from "@/lib/miniapp/devdocs";

export const metadata: Metadata = {
  title: "Röbel Mini Apps",
  description: "Bau Apps für Röbel — mit KI, deinem eigenen Agenten oder deinem eigenen Hosting.",
};

const AGENT_PROMPT = `Lies ${DOCS_BASE_URL}/mini-apps/publish.md und veröffentliche diese App im Röbel Mini App Store.`;

const WAYS: { title: string; text: string; href: string; cta: string; prompt?: string }[] = [
  {
    title: "Mit KI bauen",
    text: "Beschreib deine Idee im KI-Baukasten. Wir hosten die App für dich.",
    href: "/editor",
    cta: "KI-Baukasten öffnen",
  },
  {
    title: "Mit deinem Agenten",
    text: "Claude Code, Codex oder Cursor? Gib deinem Agenten diesen Satz:",
    prompt: AGENT_PROMPT,
    href: "/mini-apps/publish.md",
    cta: "Anleitung ansehen",
  },
  {
    title: "Eigenes Hosting",
    text: "Deine App läuft schon auf Vercel, Netlify oder Lovable? Manifest ablegen und per URL hinzufügen.",
    href: "/dashboard/mini-apps",
    cta: "Zum Dashboard",
  },
];

export default function MiniAppsLanding() {
  return (
    <main className="min-h-screen bg-background px-4 py-16 text-foreground">
      <div className="mx-auto max-w-4xl">
        <p className="text-sm font-semibold uppercase tracking-wide text-[#00498B] dark:text-[#7ABBF2]">Röbel Mini Apps</p>
        <h1 className="mt-2 font-heading text-4xl font-bold leading-tight md:text-5xl">
          Bau eine App für Röbel.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
          Mini-Apps laufen direkt in der Röbel App, für alle in der Stadt. Bau sie, wie du willst. Nach
          einer kurzen Prüfung ist sie live.
        </p>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {WAYS.map((w) => (
            <div key={w.title} className="flex min-w-0 flex-col rounded-lg border border-[#B4B8C1] p-5 dark:border-[#3A3B3E]">
              <h2 className="text-lg font-semibold">{w.title}</h2>
              <p className="mt-2 flex-1 text-sm text-muted-foreground">{w.text}</p>
              {w.prompt && (
                <code className="mt-3 block break-words rounded-md bg-muted p-3 text-xs leading-relaxed">{w.prompt}</code>
              )}
              {w.href.endsWith(".md") ? (
                <a href={w.href} className="mt-4 text-sm font-semibold text-[#00498B] underline dark:text-[#7ABBF2]">
                  {w.cta}
                </a>
              ) : (
                <Link href={w.href} className="mt-4 text-sm font-semibold text-[#00498B] underline dark:text-[#7ABBF2]">
                  {w.cta}
                </Link>
              )}
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/dashboard/mini-apps" className="rounded-full bg-[#00498B] px-6 py-3 text-sm font-bold text-white">
            Zum Dashboard
          </Link>
          <Link href="/developers/mini-apps" className="rounded-full border border-[#B4B8C1] px-6 py-3 text-sm font-semibold dark:border-[#3A3B3E]">
            Doku für Entwickler
          </Link>
        </div>
      </div>
    </main>
  );
}
