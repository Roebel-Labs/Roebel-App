"use client";

// Zero-setup "start building with Claude Code" card. One click mints a fresh
// API key and renders the ready-to-run `claude mcp add …` command with the real
// key already inlined (shown once) — copy → paste into Claude Code → the agent
// self-onboards via the netizen MCP's get_started tool. A paste-ready build
// prompt follows as the suggested first message. No manual key substitution, no
// docs to paste, no local setup.
import { useState } from "react";
import { ArrowRight, Check, ChevronRight, Copy, KeyRound, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { miniAppWrite } from "@/components/mini-apps/client";

const STEP_LABELS = ["API-Key erzeugen", "Befehl kopieren", "In Claude Code einfügen"];

/** Visual 3-step guide; `stage` 0 = before key gen, 1 = command ready. */
function Steps({ stage }: { stage: 0 | 1 }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
      {STEP_LABELS.map((label, i) => {
        const done = stage > 0 && i === 0;
        const active = i === stage;
        return (
          <li key={label} className="flex items-center gap-1.5">
            <span
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold",
                done || active
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {done ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            <span
              className={cn(
                "text-[11px]",
                active ? "font-semibold text-foreground" : "text-muted-foreground",
              )}
            >
              {label}
            </span>
            {i < STEP_LABELS.length - 1 ? (
              <ChevronRight className="h-3 w-3 text-muted-foreground/40" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

const BUILD_PROMPT = `Baue mir eine Röbel Mini-App, die [BESCHREIBE DEINE IDEE].
Nutze die verbundenen netizen-Tools: lies zuerst get_started und get_docs, baue eine einzelne HTML-Datei, prüfe sie mit validate_html und veröffentliche sie mit publish_html_app. Deutsche UI-Texte, niemals Wallet-Adressen oder Krypto-Jargon zeigen (Währung: „Röbel-Münzen").`;

function CopyBlock({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(text);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
          }}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-[8px] border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-[10px] border border-border bg-muted/50 p-2.5 font-mono text-[11px] leading-relaxed">
        {text}
      </pre>
    </div>
  );
}

export function QuickStartCard({ wallet }: { wallet: string | null }) {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://www.roebel.app";
  const command = apiKey
    ? `claude mcp add --transport http netizen ${origin}/api/mcp --header "Authorization: Bearer ${apiKey}"`
    : null;

  async function generate() {
    if (!wallet) {
      setError("Bitte verbinde dich zuerst.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await miniAppWrite<{ key: string }>(
        "api-keys",
        "POST",
        { name: "Claude Code Quick-Start" },
        wallet,
      );
      setApiKey(res.key);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-primary/30 bg-primary/[0.04] p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-primary/10 text-primary">
          <Sparkles className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Sofort loslegen mit Claude Code</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            Kein Setup nötig. Erzeuge deinen persönlichen Befehl — er enthält den API-Key schon —,
            füge ihn in Claude Code ein, und der Agent baut &amp; veröffentlicht selbst.
          </p>
        </div>
      </div>

      <div className="mt-3 rounded-[10px] border border-border bg-background/60 px-3 py-2">
        <Steps stage={command ? 1 : 0} />
      </div>

      {!command ? (
        <div className="mt-3">
          <Button className="w-full" onClick={generate} disabled={busy || !wallet}>
            {busy ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <KeyRound className="mr-1.5 h-4 w-4" />
            )}
            Jetzt API-Key erzeugen &amp; Befehl bauen
            {!busy ? <ArrowRight className="ml-1.5 h-4 w-4" /> : null}
          </Button>
          <p className="mt-2 text-center text-[11px] leading-relaxed text-muted-foreground">
            Ein Klick erstellt einen sicheren API-Key (nur einmal sichtbar) und den fertigen Befehl.
          </p>
          {!wallet ? (
            <p className="mt-1 text-center text-xs font-medium text-primary">
              Verbinde dich zuerst, um den Key zu erzeugen.
            </p>
          ) : null}
          {error ? <p className="mt-2 text-center text-xs text-destructive">{error}</p> : null}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="flex items-start gap-2 rounded-[10px] border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              API-Key erstellt und im Befehl eingesetzt — er wird{" "}
              <strong>nur jetzt angezeigt</strong>. Kopiere die beiden Blöcke.
            </span>
          </div>
          <CopyBlock label="2 · Befehl kopieren & in Claude Code einfügen" text={command} />
          <CopyBlock label="3 · Danach diese Nachricht senden" text={BUILD_PROMPT} />
        </div>
      )}
    </Card>
  );
}
