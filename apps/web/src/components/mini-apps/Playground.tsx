"use client";

// The reviewer Playground: renders an app's home_url in a sandboxed iframe wired
// to the real web bridge host so wallet / rewards / analytics / context can be
// exercised before approval. Also reused (conceptually) by the AI-builder preview.
import { useEffect, useRef, useState } from "react";
import { useActiveAccount } from "thirdweb/react";
import { RefreshCw, Play, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createWebMiniAppHost, type WebMiniAppHost } from "@/lib/miniapp-host";
import type { MiniAppRow } from "@/lib/miniapp/types";
import type { MiniAppPermission, WalletAccount } from "@netizen-labs/miniapp-sdk";

const GNOSIS_CHAIN_ID = 100;

interface CallLogEntry {
  method: string;
  ok: boolean;
  at: number;
}

export function Playground({ app, html }: { app: MiniAppRow; html?: string | null }) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const hostRef = useRef<WebMiniAppHost | null>(null);
  const account = useActiveAccount();
  const [log, setLog] = useState<CallLogEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [slow, setSlow] = useState(false);
  const [enforcePermissions, setEnforcePermissions] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [mockCitizen, setMockCitizen] = useState(true);

  // Direct-HTML mode: render the stored version document (srcDoc) instead of
  // fetching home_url — independent of DNS/wildcard-domain wiring and of the
  // /mini tombstone for rejected/suspended apps, so reviewers always see the
  // real app. Bridge + same-origin API calls (Mini-CMS) work identically.
  const useSrcDoc = typeof html === "string" && html.length > 0;

  // Reset splash/log only when the APP or an iframe reload changes — not when
  // the reviewer wallet (re)connects: the embedded app keeps running and never
  // calls ready() twice, so resetting on account change froze the splash.
  useEffect(() => {
    setReady(false);
    setLog([]);
  }, [app.id, app.home_url, reloadKey]);

  // Surface a hint when the app never announces itself (blocked framing,
  // tombstoned home_url, broken script) instead of an eternal splash.
  useEffect(() => {
    setSlow(false);
    const t = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(t);
  }, [app.id, app.home_url, reloadKey]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const walletAccount: WalletAccount | null = account?.address
      ? { address: account.address, chainId: GNOSIS_CHAIN_ID }
      : null;

    const host = createWebMiniAppHost({
      iframe,
      app: {
        id: app.id,
        slug: app.slug,
        name: app.name,
        // srcDoc iframes have an opaque origin — a non-URL homeUrl makes the
        // host post with targetOrigin "*" (same pattern as the editor preview).
        homeUrl: useSrcDoc ? "playground-srcdoc" : app.home_url,
        permissions: (app.permissions ?? []) as MiniAppPermission[],
        enforcePermissions,
      },
      user: {
        id: account?.address ?? "reviewer",
        displayName: "Prüfer:in",
        isCitizen: mockCitizen,
      },
      account: walletAccount,
      authToken: null,
      onCall: (method, ok) => {
        if (method === "actions.ready") setReady(true);
        setLog((prev) => [{ method, ok, at: Date.now() }, ...prev].slice(0, 40));
      },
      confirmSign: async (req) =>
        window.confirm(`Mini App möchte signieren:\n${req.method}\n\nAls Prüfer:in bestätigen?`),
    });
    hostRef.current = host;

    return () => {
      host.destroy();
      hostRef.current = null;
    };
    // reloadKey forces a rebuild after an iframe reload
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.id, app.home_url, useSrcDoc, enforcePermissions, mockCitizen, account?.address, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_1fr]">
      {/* Device frame */}
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                ready ? "bg-emerald-500" : "bg-amber-500 animate-pulse",
              )}
            />
            <span className="text-xs font-medium text-muted-foreground">
              {ready ? "ready() empfangen" : "Wartet auf ready()…"}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={reload}>
              <RefreshCw className="mr-1 h-3.5 w-3.5" /> Neu laden
            </Button>
            <a
              href={app.home_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-7 items-center rounded-md px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="mr-1 h-3.5 w-3.5" /> Öffnen
            </a>
          </div>
        </div>

        <div
          className="relative mx-auto overflow-hidden rounded-[24px] border-4 border-slate-800 bg-black"
          style={{ width: 320, height: 640, maxWidth: "100%" }}
        >
          <iframe
            key={reloadKey}
            ref={iframeRef}
            {...(useSrcDoc ? { srcDoc: html as string } : { src: app.home_url })}
            title={`Playground: ${app.name}`}
            // Cross-origin isolation; scripts/forms/popups only.
            sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
            className="h-full w-full border-0 bg-white"
          />
          {!ready && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/90 px-4 text-center">
              <Play className="h-6 w-6 text-[#00498B]" />
              <p className="text-xs text-muted-foreground">Splash bis die App ready() ruft</p>
              {slow && (
                <p className="text-xs text-red-600">
                  Die App hat sich nach 8&nbsp;s nicht gemeldet.{" "}
                  {useSrcDoc
                    ? "Vermutlich ein Skriptfehler im Dokument — Konsole prüfen."
                    : "Lädt die home_url? Externe Seiten müssen das Einbetten erlauben (frame-ancestors) und den Netizen-SDK-Handshake ausführen."}
                </p>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Controls + call log */}
      <div className="space-y-4">
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold">Test-Umgebung</h3>
          <div className="space-y-3 text-sm">
            <label className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">
                Berechtigungen erzwingen
                <span className="ml-1 text-xs">
                  ({(app.permissions ?? []).join(", ") || "keine"})
                </span>
              </span>
              <input
                type="checkbox"
                checked={enforcePermissions}
                onChange={(e) => setEnforcePermissions(e.target.checked)}
                className="h-4 w-4"
              />
            </label>
            <label className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Kontext-Nutzer:in ist Bürger:in</span>
              <input
                type="checkbox"
                checked={mockCitizen}
                onChange={(e) => setMockCitizen(e.target.checked)}
                className="h-4 w-4"
              />
            </label>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Verbundene Wallet</span>
              <span className="font-mono text-xs">
                {account?.address
                  ? `${account.address.slice(0, 6)}…${account.address.slice(-4)}`
                  : "keine (verbinde eine, um Wallet/Belohnungen zu testen)"}
              </span>
            </div>
          </div>
          <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            Belohnungen im Playground laufen echt gegen das Budget dieser App. Solange die App nicht
            live ist (Budget 0) werden Grants mit budget_exceeded abgelehnt — genau wie in Produktion.
          </p>
        </Card>

        <Card className="p-4">
          <h3 className="mb-2 text-sm font-semibold">Bridge-Aufrufe</h3>
          {log.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Noch keine Aufrufe. Interagiere mit der App, um den Bridge-Verkehr zu sehen.
            </p>
          ) : (
            <div className="max-h-72 divide-y divide-border overflow-y-auto">
              {log.map((e, i) => (
                <div key={i} className="flex items-center justify-between gap-2 py-1.5 text-xs">
                  <span className="font-mono">{e.method}</span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 font-medium",
                      e.ok
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                        : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
                    )}
                  >
                    {e.ok ? "ok" : "error"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
