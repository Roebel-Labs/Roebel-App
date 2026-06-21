// Fire-and-forget analytics for the Circles mini-app → public.miniapp_events.
// Powers the hackathon "activity" metric (weekly unique wallets + time spent)
// and referral attribution. Never throws, never blocks the UI, silent on failure.
import { SUPABASE_URL, SUPABASE_ANON } from "./supabase";

type Props = Record<string, unknown>;

let sessionId = "";
let walletCtx: string | null = null; // lowercased connected wallet
let refCtx: string | null = null; // lowercased referrer from ?ref

function sid(): string {
  if (sessionId) return sessionId;
  const gen = () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
    void fetch(`${SUPABASE_URL}/rest/v1/miniapp_events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${SUPABASE_ANON}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ session_id: sid(), wallet: walletCtx, ref: refCtx, event, props }),
      keepalive: true,
    }).catch(() => {});
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
  document.addEventListener("visibilitychange", onVis);
  if (document.visibilityState === "visible") start();
  return () => {
    document.removeEventListener("visibilitychange", onVis);
    stop();
  };
}
