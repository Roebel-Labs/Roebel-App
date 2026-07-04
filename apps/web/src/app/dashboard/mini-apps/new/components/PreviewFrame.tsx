"use client";

// Live preview: the generated single-file app runs in a sandboxed srcdoc iframe
// wired to the REAL Netizen web host bridge — ready()/context/balance/track all
// settle like in the Röbel app. Mutating calls (rewards, analytics ingest) are
// mocked via handler overrides because the preview app isn't registered yet.
import { useEffect, useRef, useState } from "react";
import { useActiveAccount } from "thirdweb/react";
import { Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { createWebMiniAppHost, type WebMiniAppHost } from "@/lib/miniapp-host";
import type { MiniAppPermission, WalletAccount } from "@netizen-labs/miniapp-sdk";

const GNOSIS_CHAIN_ID = 100;
const ALL_PERMISSIONS: MiniAppPermission[] = [
  "wallet",
  "rewards",
  "notifications",
  "circles",
  "share",
];

export interface BridgeCall {
  method: string;
  ok: boolean;
  at: number;
}

export function PreviewFrame({
  html,
  appName,
  onCallsChange,
}: {
  html: string | null;
  appName: string;
  onCallsChange?: (calls: BridgeCall[]) => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const hostRef = useRef<WebMiniAppHost | null>(null);
  const account = useActiveAccount();
  const [ready, setReady] = useState(false);
  const [calls, setCalls] = useState<BridgeCall[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  // Mock reward budget for the unregistered preview app (mirrors production semantics).
  const budgetRef = useRef(100);

  useEffect(() => {
    onCallsChange?.(calls);
  }, [calls, onCallsChange]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !html) return;

    setReady(false);
    setCalls([]);
    budgetRef.current = 100;

    const walletAccount: WalletAccount | null = account?.address
      ? { address: account.address, chainId: GNOSIS_CHAIN_ID }
      : null;

    const host = createWebMiniAppHost({
      iframe,
      app: {
        id: "preview",
        slug: "preview",
        name: appName,
        // Not a URL on purpose: the srcdoc iframe has an opaque origin, so the
        // host must post with targetOrigin "*" and filter by contentWindow only.
        homeUrl: "preview",
        permissions: ALL_PERMISSIONS,
        enforcePermissions: false,
      },
      user: {
        id: account?.address ?? "builder-preview",
        displayName: "Test-Bürger:in",
        isCitizen: true,
      },
      account: walletAccount,
      authToken: null,
      onCall: (method, ok) => {
        if (method === "actions.ready") setReady(true);
        setCalls((prev) => [{ method, ok, at: Date.now() }, ...prev].slice(0, 30));
      },
      confirmSign: async (req) =>
        window.confirm(`Die Mini-App möchte signieren:\n${req.method}\n\nBestätigen?`),
      overrides: {
        // Preview-only mocks: the app has no registry row yet, so the real
        // reward/analytics endpoints would reject it. Balance stays real when a
        // wallet is connected.
        grantReward: (p: { amount: number; idempotencyKey: string }) => {
          if (budgetRef.current < p.amount) {
            throw { code: "budget_exceeded", message: "Vorschau-Budget aufgebraucht." };
          }
          budgetRef.current -= p.amount;
          return {
            granted: true,
            txRef: `preview-${p.idempotencyKey.slice(0, 8)}`,
            remainingBudget: budgetRef.current,
          };
        },
        notificationsSend: () => ({ sent: true }),
        track: () => {
          /* keep preview sessions out of mini_app_events */
        },
        getMuenzenBalance: async () => {
          if (!account?.address) return { balance: "48", decimals: 18, symbol: "RÖ" as const };
          const res = await fetch(
            `/api/mini-apps/muenzen-balance?wallet=${encodeURIComponent(account.address)}`,
          );
          if (!res.ok) return { balance: "0", decimals: 18, symbol: "RÖ" as const };
          return (await res.json()) as { balance: string; decimals: number; symbol: "RÖ" };
        },
      },
    });
    hostRef.current = host;
    return () => {
      host.destroy();
      hostRef.current = null;
    };
  }, [html, account?.address, appName, reloadKey]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden rounded-[10px] border border-border bg-background">
      {/* Bauplan stage — construction-plan grid behind the device */}
      <div
        aria-hidden
        className="absolute inset-0 [background-size:24px_24px] [background-image:linear-gradient(to_right,rgba(0,73,139,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,73,139,0.06)_1px,transparent_1px)] dark:[background-image:linear-gradient(to_right,rgba(122,187,242,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(122,187,242,0.06)_1px,transparent_1px)]"
      />

      {html ? (
        <>
          <div className="relative z-10 my-4 flex min-h-0 flex-1 items-center">
            <div className="relative h-[min(72vh,700px)] w-[360px] max-w-full overflow-hidden rounded-[28px] border border-border bg-black p-1.5 shadow-xl">
              <iframe
                key={`${reloadKey}`}
                ref={iframeRef}
                srcDoc={html}
                title={`Vorschau: ${appName}`}
                sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
                className="h-full w-full rounded-[20px] border-0 bg-white"
              />
              {!ready && (
                <div className="pointer-events-none absolute inset-1.5 flex flex-col items-center justify-center gap-2 rounded-[20px] bg-white/95 text-center dark:bg-[#202124]/95">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <p className="px-6 text-xs text-muted-foreground">
                    Splash, bis die App <span className="font-mono">ready()</span> ruft
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* status strip */}
          <div className="relative z-10 mb-3 flex w-full max-w-[520px] items-center justify-between gap-3 px-4">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={cn(
                  "h-2 w-2 shrink-0 rounded-full",
                  ready ? "bg-success" : "animate-pulse bg-warning",
                )}
              />
              <span className="truncate font-mono text-[11px] text-muted-foreground">
                {ready
                  ? calls[0]
                    ? `${calls[0].method} ${calls[0].ok ? "✓" : "✕"} · ${calls.length} Bridge-Aufrufe`
                    : "ready() empfangen"
                  : "Wartet auf ready()…"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <RefreshCw className="h-3 w-3" /> Neu laden
            </button>
          </div>
        </>
      ) : (
        <div className="relative z-10 px-8 text-center">
          <p className="text-sm font-medium text-foreground">Noch keine Vorschau</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Sobald die erste Version gebaut ist, läuft sie hier — mit echter Verbindung zum
            Röbel-Host.
          </p>
        </div>
      )}
    </div>
  );
}
