// Analytics for the Röbel Circles mini app → the Netizen host, which writes them
// to public.mini_app_events (app id + session + wallet resolved host-side).
//
// This used to POST the legacy public.miniapp_events table directly with the anon
// key. It now delegates to `sdk.track(event, props)` — fire-and-forget, never
// throws, never blocks the UI. Event NAMES are unchanged so historical dashboards
// keep working; we still thread the referrer through `props.ref` for referral
// attribution (the wallet itself is added by the host from the connected account).
import { sdk } from "@netizen/miniapp-sdk";

type Props = Record<string, unknown>;

let sessionId = "";
let walletCtx: string | null = null; // lowercased connected wallet (kept for props)
let refCtx: string | null = null; // lowercased referrer from ?ref

function gen(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sid(): string {
  if (sessionId) return sessionId;
  try {
    const k = "rc_sid";
    let s = sessionStorage.getItem(k);
    if (!s) {
      s = gen();
      sessionStorage.setItem(k, s);
    }
    sessionId = s;
  } catch {
    sessionId = gen();
  }
  return sessionId;
}

/** Call once on app load. `ref` is the referrer wallet from the `?ref=` param. */
export function initAnalytics(opts: { ref?: string | null }): void {
  sid();
  refCtx = opts.ref ? opts.ref.toLowerCase() : null;
}

/** Attach the connected wallet to subsequent events (call when it connects). */
export function setAnalyticsWallet(wallet: string | null): void {
  walletCtx = wallet ? wallet.toLowerCase() : null;
}

export function track(event: string, props: Props = {}): void {
  try {
    // sdk.track is fire-and-forget and swallows all errors. We fold in the
    // session id + referrer (and wallet, for props-level attribution); the host
    // additionally stamps the app id and the real connected wallet server-side.
    sdk.track(event, {
      session_id: sid(),
      ...(walletCtx ? { wallet: walletCtx } : {}),
      ...(refCtx ? { ref: refCtx } : {}),
      ...props,
    });
  } catch {
    /* never throw */
  }
}

/**
 * Visibility-aware heartbeat → time-spent. Emits `heartbeat {secs}` every
 * `secs` while the tab is visible. Returns a cleanup fn. Time spent for a
 * session = sum(heartbeat.secs).
 */
export function startHeartbeat(secs = 25): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;
  const start = () => {
    if (timer) return;
    timer = setInterval(() => track("heartbeat", { secs }), secs * 1000);
  };
  const stop = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };
  const onVis = () => (document.visibilityState === "visible" ? start() : stop());
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVis);
    if (document.visibilityState === "visible") start();
  }
  return () => {
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVis);
    stop();
  };
}
