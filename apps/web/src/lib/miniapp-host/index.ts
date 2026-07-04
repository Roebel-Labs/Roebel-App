// Web bridge host — wires a sandboxed <iframe> mini app to the Netizen host
// bridge over `postMessage`. Reused by:
//   • the admin Playground (real reviewer wallet / mock user)
//   • the AI-builder live preview (agent D)
//
// It constructs a `createHostBridge` from `@netizen-labs/miniapp-sdk/host`, posts
// replies into the iframe, and routes handler calls to the mini-apps API
// (rewards / events / notifications) or to injected wallet/context providers.
//
// CLIENT-ONLY (touches `window`). Do not import from a server component.
"use client";

import {
  createHostBridge,
  type HostBridge,
  type HostHandlers,
  type MiniAppContext,
} from "@netizen-labs/miniapp-sdk/host";
import type {
  BridgeMessage,
  BridgeMethod,
  Eip1193Provider,
  Eip1193RequestArgs,
  GrantRewardParams,
  MiniAppPermission,
  NetizenEvent,
  PayParams,
  WalletAccount,
} from "@netizen-labs/miniapp-sdk";

export interface WebHostApp {
  id: string;
  slug: string;
  name: string;
  homeUrl: string;
  permissions: MiniAppPermission[];
  /** Approved apps enforce their permission set; in the Playground pass `undefined` to allow-all. */
  enforcePermissions?: boolean;
}

export interface WebHostUser {
  id: string;
  displayName?: string;
  avatarUrl?: string;
  isCitizen: boolean;
}

export interface WebMiniAppHostOptions {
  iframe: HTMLIFrameElement;
  app: WebHostApp;
  user: WebHostUser | null;
  /**
   * An injected EIP-1193 provider (e.g. from the reviewer's connected thirdweb
   * wallet). When omitted, wallet methods reply with no account / are rejected.
   */
  walletProvider?: Eip1193Provider | null;
  /** Current wallet address+chain, for `wallet.getAccount`. */
  account?: WalletAccount | null;
  /** Optional token for `auth.getToken` (mini app validates it against its own backend). */
  authToken?: string | null;
  /** Observability hook (method + ok) — surfaced in the Playground call log. */
  onCall?: (method: string, ok: boolean) => void;
  /** Confirm sheet for signing methods. Resolve=proceed, reject=user_rejected. */
  confirmSign?: (req: Eip1193RequestArgs) => Promise<boolean>;
}

export interface WebMiniAppHost {
  bridge: HostBridge;
  /** Push an unsolicited event to the mini app (e.g. walletChanged). */
  sendEvent: (event: NetizenEvent, data?: unknown) => void;
  /** Detach the window message listener. Call on unmount. */
  destroy: () => void;
}

const SIGNING_METHODS = new Set([
  "eth_sendTransaction",
  "personal_sign",
  "eth_sign",
  "eth_signTypedData",
  "eth_signTypedData_v4",
]);

function rejected(): never {
  throw { code: "user_rejected", message: "Vom Nutzer abgelehnt." };
}
function unsupported(msg: string): never {
  throw { code: "unsupported", message: msg };
}

/** Try to derive the origin the iframe is loaded from (for message filtering + targetOrigin). */
function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "*";
  }
}

/**
 * Create the web host. Attach the returned `destroy` to your effect cleanup.
 * The mini app must load with `src={app.homeUrl}` for origin filtering to work.
 */
export function createWebMiniAppHost(opts: WebMiniAppHostOptions): WebMiniAppHost {
  const { iframe, app, user, walletProvider, account, authToken, onCall, confirmSign } = opts;
  const targetOrigin = originOf(app.homeUrl);

  const post = (message: BridgeMessage) => {
    // The iframe may not be same-origin; postMessage with the app's origin.
    iframe.contentWindow?.postMessage(message, targetOrigin === "*" ? "*" : targetOrigin);
  };

  const handlers: HostHandlers = {
    hello: () => ({ ok: true, host: "web" }),
    ready: () => {
      /* Playground/preview dismiss their own splash via onCall('actions.ready'). */
    },
    close: () => {
      /* no-op in an embedded preview; the shell owns closing */
    },
    openUrl: ({ url }: { url: string }) => {
      if (typeof window !== "undefined") window.open(url, "_blank", "noopener,noreferrer");
    },
    share: async ({ text, url }: { text?: string; url?: string }) => {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ text, url });
      }
    },
    addMiniApp: () => ({ added: true }),

    getContext: (): MiniAppContext => ({
      user: user ? { ...user } : null,
      host: { name: "Röbel (Web)", platform: "web", version: "1.0.0" },
      safeAreaInsets: { top: 0, bottom: 0, left: 0, right: 0 },
      launch: { entry: "playground", referrer: "web" },
    }),

    walletGetAccount: () => account ?? null,
    walletRequest: async (req: Eip1193RequestArgs) => {
      if (!walletProvider) unsupported("Keine Wallet verbunden.");
      if (SIGNING_METHODS.has(req.method)) {
        const ok = confirmSign ? await confirmSign(req) : window.confirm(
          `Mini App möchte signieren:\n${req.method}\n\nBestätigen?`,
        );
        if (!ok) rejected();
      }
      return walletProvider.request(req);
    },

    authGetToken: () => (authToken ? { token: authToken } : null),
    authSignIn: () => {
      if (!authToken) unsupported("Kein Auth-Token in dieser Vorschau.");
      return { token: authToken };
    },

    // Haptics: no-op on web (kept so the SDK resolves instead of rejecting).
    hapticsImpact: () => {},
    hapticsNotification: () => {},
    hapticsSelection: () => {},

    getMuenzenBalance: async () => {
      if (!account?.address) return { balance: "0", decimals: 18, symbol: "RÖ" as const };
      const res = await fetch(
        `/api/mini-apps/muenzen-balance?wallet=${encodeURIComponent(account.address)}`,
      );
      if (!res.ok) return { balance: "0", decimals: 18, symbol: "RÖ" as const };
      return (await res.json()) as { balance: string; decimals: number; symbol: "RÖ" };
    },

    grantReward: async (p: GrantRewardParams) => {
      const recipient = account?.address;
      if (!recipient) unsupported("Keine Wallet für die Belohnung verbunden.");
      const res = await fetch("/api/mini-apps/rewards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          appId: app.id,
          amount: p.amount,
          reason: p.reason,
          idempotencyKey: p.idempotencyKey,
          wallet: recipient,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        granted?: boolean;
        txRef?: string;
        remainingBudget?: number;
        error?: string;
        code?: string;
      };
      if (!res.ok) {
        throw { code: json.code ?? "internal", message: json.error ?? `HTTP ${res.status}` };
      }
      return {
        granted: Boolean(json.granted),
        txRef: json.txRef,
        remainingBudget: json.remainingBudget,
      };
    },

    pay: async (p: PayParams) => {
      // User-signed transfer must go through the wallet provider (confirm sheet).
      if (!walletProvider || !account?.address) unsupported("Keine Wallet verbunden.");
      const ok = confirmSign
        ? await confirmSign({ method: "eth_sendTransaction", params: [p] })
        : window.confirm(`Röbel-Münzen senden: ${p.amount} RÖ an ${p.to}?`);
      if (!ok) rejected();
      // Actual transfer construction is host-specific; the web Playground surfaces
      // this via the wallet provider. Left to the shell to complete for real sends.
      unsupported("Zahlungen sind in der Web-Vorschau nicht verfügbar.");
    },

    notificationsSend: async (p: { title: string; body: string; targetUrl?: string }) => {
      const res = await fetch("/api/mini-apps/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          miniAppId: app.id,
          slug: app.slug,
          sessionId: "host-notification",
          event: "notification_send",
          props: p,
        }),
      });
      return { sent: res.ok };
    },

    track: (p: { event: string; props?: Record<string, unknown> }) => {
      // Fire-and-forget analytics ingest.
      void fetch("/api/mini-apps/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          miniAppId: app.id,
          slug: app.slug,
          sessionId: playgroundSession(),
          wallet: account?.address ?? null,
          event: p.event,
          props: p.props ?? {},
        }),
      }).catch(() => undefined);
    },
  };

  const bridge = createHostBridge({
    handlers,
    post,
    grantedPermissions: app.enforcePermissions ? app.permissions : undefined,
    onCall: onCall ? (m: BridgeMethod, ok: boolean) => onCall(m, ok) : undefined,
  });

  const onMessage = (ev: MessageEvent) => {
    // Only accept messages from the iframe's own contentWindow.
    if (ev.source !== iframe.contentWindow) return;
    if (targetOrigin !== "*" && ev.origin !== targetOrigin) return;
    bridge.handleMessage(ev.data);
  };

  window.addEventListener("message", onMessage);

  return {
    bridge,
    sendEvent: (event, data) => bridge.sendEvent(event, data),
    destroy: () => window.removeEventListener("message", onMessage),
  };
}

let _session: string | null = null;
function playgroundSession(): string {
  if (_session) return _session;
  _session =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `pg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return _session;
}
