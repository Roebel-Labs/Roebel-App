"use client";

// Shared host wiring for builder frames (phone preview + canvas frames): runs a
// generated single-file app in a sandboxed srcdoc iframe against the REAL
// Netizen web host bridge. Mutating calls (rewards, analytics ingest) are
// mocked via handler overrides because the previewed app isn't registered yet;
// balance is real when a wallet is connected.
import { useEffect, useRef, useState, type RefObject } from "react";
import { useActiveAccount } from "thirdweb/react";
import { createWebMiniAppHost } from "@/lib/miniapp-host";
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

export function useMiniAppHost(
  iframeRef: RefObject<HTMLIFrameElement | null>,
  opts: { html: string | null; appName: string; enabled?: boolean },
) {
  const account = useActiveAccount();
  const [ready, setReady] = useState(false);
  const [calls, setCalls] = useState<BridgeCall[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  // Mock reward budget for the unregistered preview app (mirrors production semantics).
  const budgetRef = useRef(100);
  const enabled = opts.enabled ?? true;

  useEffect(() => {
    const iframe = iframeRef.current;
    setReady(false);
    setCalls([]);
    if (!iframe || !opts.html || !enabled) return;
    budgetRef.current = 100;

    const walletAccount: WalletAccount | null = account?.address
      ? { address: account.address, chainId: GNOSIS_CHAIN_ID }
      : null;

    const host = createWebMiniAppHost({
      iframe,
      app: {
        id: "preview",
        slug: "preview",
        name: opts.appName,
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
    return () => host.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.html, enabled, account?.address, opts.appName, reloadKey, iframeRef]);

  // Consumers should key the <iframe> on `reloadKey` so reload() remounts it.
  return { ready, calls, account, reloadKey, reload: () => setReloadKey((k) => k + 1) };
}
