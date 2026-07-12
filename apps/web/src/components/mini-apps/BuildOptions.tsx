"use client";

// "Mit deinen eigenen Tools bauen" — the three external build paths (Claude
// Code/MCP, Lovable & Co., Netizen SDK) as copy-paste cards with logos.
// Shown on the mini-app dashboard under "Meine Apps".
import { useState } from "react";
import Link from "next/link";
import { Check, Copy } from "lucide-react";
import { Card } from "@/components/ui/card";
import { QuickStartCard } from "@/components/mini-apps/QuickStartCard";
import {
  LOVABLE_PROMPT,
  MCP_SNIPPET,
  SDK_SNIPPET,
} from "@/lib/miniapp/buildSnippets";

// Claude spark (terracotta starburst).
function ClaudeLogo() {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[#F4EFE9]">
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
        <g stroke="#D97757" strokeWidth="2.4" strokeLinecap="round">
          <line x1="16.5" y1="12" x2="22" y2="12" />
          <line x1="15.64" y1="14.65" x2="20.09" y2="17.88" />
          <line x1="13.39" y1="16.28" x2="15.09" y2="21.51" />
          <line x1="10.61" y1="16.28" x2="8.91" y2="21.51" />
          <line x1="8.36" y1="14.65" x2="3.91" y2="17.88" />
          <line x1="7.5" y1="12" x2="2" y2="12" />
          <line x1="8.36" y1="9.35" x2="3.91" y2="6.12" />
          <line x1="10.61" y1="7.72" x2="8.91" y2="2.49" />
          <line x1="13.39" y1="7.72" x2="15.09" y2="2.49" />
          <line x1="15.64" y1="9.35" x2="20.09" y2="6.12" />
        </g>
      </svg>
    </span>
  );
}

// Lovable gradient heart.
function LovableLogo() {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[#FFF0F3]">
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
        <defs>
          <linearGradient id="lovable-grad" x1="0" y1="0" x2="24" y2="24">
            <stop offset="0" stopColor="#FF61A6" />
            <stop offset="0.55" stopColor="#FF4D4D" />
            <stop offset="1" stopColor="#FF8A00" />
          </linearGradient>
        </defs>
        <path
          fill="url(#lovable-grad)"
          d="M12 21s-7.5-4.9-9.8-9.2C.6 8.7 2.2 5 5.8 5c2.2 0 3.6 1.2 4.5 2.6.3.5.9.5 1.2 0C12.6 6.2 14 5 16.2 5c3.6 0 5.2 3.7 3.6 6.8C17.5 16.1 12 21 12 21z"
        />
      </svg>
    </span>
  );
}

// Netizen monogram.
function NetizenLogo() {
  return (
    <span
      aria-hidden
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[#0A0A0A] font-heading text-lg font-black text-white"
    >
      N
    </span>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      }}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-[8px] border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5 text-green-600" /> Kopiert
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" /> Kopieren
        </>
      )}
    </button>
  );
}

const OPTIONS = [
  {
    key: "claude",
    logo: <ClaudeLogo />,
    title: "Claude Code",
    subtitle: "MCP-Server für KI-Agenten",
    text: "Verbinde Claude Code (oder jeden MCP-fähigen Agenten) mit der Plattform: Doku lesen, HTML validieren, direkt veröffentlichen.",
    snippet: MCP_SNIPPET,
    link: { href: "/dashboard/mini-apps/api", label: "API-Key erstellen →" },
  },
  {
    key: "lovable",
    logo: <LovableLogo />,
    title: "Lovable, v0 & Co.",
    subtitle: "Prompt zum Einfügen",
    text: "Bau mit deinem Lieblings-KI-Editor und hoste selbst. Außerhalb der Röbel App läuft das SDK im Mock-Modus — die Vorschau funktioniert normal.",
    snippet: LOVABLE_PROMPT,
    link: { href: "/dashboard/mini-apps/import", label: "Gehostete URL einreichen →" },
  },
  {
    key: "sdk",
    logo: <NetizenLogo />,
    title: "Netizen SDK",
    subtitle: "@netizen-labs/miniapp-sdk",
    text: "Das SDK verbindet deine App mit der Röbel App: Nutzer-Kontext, Röbel-Münzen, Benachrichtigungen. Per npm oder als ES-Modul-Import.",
    snippet: SDK_SNIPPET,
    link: { href: "/developers/mini-apps", label: "Entwickler-Doku →" },
  },
] as const;

export function BuildOptions({
  className = "mt-10",
  wallet,
}: {
  className?: string;
  wallet?: string | null;
}) {
  return (
    <section className={className}>
      <h2 className="text-base font-semibold">Mit deinen eigenen Tools bauen</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Am schnellsten mit Claude Code — ein Befehl genügt. Oder bau mit Lovable/v0 oder direkt
        gegen das SDK.
      </p>

      {/* Zero-setup fast path: one command with the API key already inlined. */}
      <div className="mt-4">
        <QuickStartCard wallet={wallet ?? null} />
      </div>

      {/* Reference paths — stacked rows so they fit the narrow settings pane. */}
      <div className="mt-4 flex flex-col gap-3">
        {OPTIONS.map((o) => (
          <Card key={o.key} className="p-4">
            <div className="flex items-center gap-3">
              {o.logo}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{o.title}</p>
                <p className="truncate text-xs text-muted-foreground">{o.subtitle}</p>
              </div>
              <CopyButton text={o.snippet} label={`${o.title}-Snippet kopieren`} />
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{o.text}</p>
            <details className="group mt-2">
              <summary className="cursor-pointer list-none text-xs font-medium text-primary hover:underline">
                Snippet anzeigen
              </summary>
              <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-[10px] border border-border bg-muted/50 p-2.5 font-mono text-[11px] leading-relaxed">
                {o.snippet}
              </pre>
            </details>
            <Link
              href={o.link.href}
              className="mt-2 inline-block text-xs font-medium text-primary hover:underline"
            >
              {o.link.label}
            </Link>
          </Card>
        ))}
      </div>
    </section>
  );
}
