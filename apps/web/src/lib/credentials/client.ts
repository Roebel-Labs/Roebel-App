// Browser-side helper for the credential routes (/api/credentials/*). Every call is signed with
// the account the browser is logged in with, exactly like the members page talks to the
// org-membership function: the server re-derives the canonical message and verifies the
// signature. Nothing here sends a transaction: every change becomes a prepared action that an
// owner or admin confirms on the phone.
// Relative imports only: loaded by `npx tsx --test`.
import { buildSignedMessage, CREDENTIALS_SCOPE, type CredentialAction } from "../signed-request/message";
import type { SigningAccount } from "../org-membership/client";

export type CredentialRoute = "org" | "actions" | "me";

export type CredentialsResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string; status: number };

export type ActionStatus = "awaiting_confirmation" | "submitted" | "done" | "failed" | "cancelled" | "expired";

/** What the dashboard shows of a prepared action (subset of the server's action_get / actions_list rows). */
export type ActionView = {
  id: string;
  status: ActionStatus;
  summary: { title: string; lines: string[]; orgName: string | null; counts?: { app: number; link: number } };
  expiresAt: string;
  error: string | null;
};

const NETWORK_MESSAGE = "Keine Verbindung zum Server. Bitte versuche es gleich noch einmal.";

/** Builds and signs the request body for one credential action. Pure apart from `signMessage`. */
export async function credentialsBody(
  account: SigningAccount,
  action: CredentialAction,
  payload: Record<string, unknown>,
  timestampSec: number = Math.floor(Date.now() / 1000),
): Promise<Record<string, unknown>> {
  const wallet = account.address.toLowerCase();
  const signature = await account.signMessage({ message: buildSignedMessage(CREDENTIALS_SCOPE, action, wallet, timestampSec, payload) });
  return { scope: CREDENTIALS_SCOPE, action, wallet, timestampSec, payload, signature };
}

/**
 * Sign and POST one action to /api/credentials/<route>. Never throws: a refused signature, a
 * network failure or a non-JSON answer become `{ ok: false }` (network → `NETWORK_ERROR`, status 0).
 */
export async function credentialsRequest<T>(
  account: SigningAccount,
  route: CredentialRoute,
  action: CredentialAction,
  payload: Record<string, unknown>,
): Promise<CredentialsResult<T>> {
  let body: Record<string, unknown>;
  try {
    body = await credentialsBody(account, action, payload);
  } catch (err) {
    return { ok: false, code: "SIGN_FAILED", message: err instanceof Error ? err.message : "Signatur abgelehnt", status: 0 };
  }
  let res: Response;
  try {
    res = await fetch(`/api/credentials/${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, code: "NETWORK_ERROR", message: NETWORK_MESSAGE, status: 0 };
  }
  let json: { ok?: boolean; data?: T; code?: string; message?: string } | null = null;
  try {
    json = (await res.json()) as typeof json;
  } catch {
    json = null;
  }
  if (json?.ok === true) return { ok: true, data: json.data as T };
  return {
    ok: false,
    code: json?.code ?? "UNAVAILABLE",
    message: json?.message ?? "Gerade nicht erreichbar. Bitte versuche es gleich noch einmal.",
    status: res.status,
  };
}

/** Like credentialsRequest, for actions that answer with a file (`letters` → PDF). */
export async function credentialsFile(
  account: SigningAccount,
  route: CredentialRoute,
  action: CredentialAction,
  payload: Record<string, unknown>,
): Promise<CredentialsResult<Blob>> {
  let res: Response;
  try {
    res = await fetch(`/api/credentials/${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(await credentialsBody(account, action, payload)),
    });
  } catch {
    return { ok: false, code: "NETWORK_ERROR", message: NETWORK_MESSAGE, status: 0 };
  }
  if (res.ok && !(res.headers.get("content-type") ?? "").includes("json")) return { ok: true, data: await res.blob() };
  const json = (await res.json().catch(() => null)) as { code?: string; message?: string } | null;
  return { ok: false, code: json?.code ?? "UNAVAILABLE", message: json?.message ?? "Gerade nicht erreichbar.", status: res.status };
}

const PENDING: readonly ActionStatus[] = ["awaiting_confirmation", "submitted"];

export function isPendingStatus(s: ActionStatus): boolean {
  return PENDING.includes(s);
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (ms <= 0 || signal?.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    }, { once: true });
  });

/**
 * Polls `action_get` (every 5 s by default) until the action is no longer awaiting confirmation
 * or submitted, and resolves with that last view. `onUpdate` sees each status change once.
 * A failed poll (network, 5xx) is retried on the next tick. Rejects when `signal` aborts.
 */
export async function pollAction(
  account: SigningAccount,
  actionId: string,
  onUpdate: (a: ActionView) => void,
  opts: { intervalMs?: number; signal?: AbortSignal } = {},
): Promise<ActionView> {
  const interval = opts.intervalMs ?? 5000;
  let lastStatus: ActionStatus | null = null;
  for (;;) {
    if (opts.signal?.aborted) throw new Error("Abfrage abgebrochen");
    const r = await credentialsRequest<ActionView & { steps?: unknown }>(account, "actions", "action_get", { actionId });
    if (opts.signal?.aborted) throw new Error("Abfrage abgebrochen");
    if (r.ok) {
      const v: ActionView = {
        id: r.data.id,
        status: r.data.status,
        summary: r.data.summary,
        expiresAt: r.data.expiresAt,
        error: r.data.error ?? null,
      };
      if (v.status !== lastStatus) {
        lastStatus = v.status;
        onUpdate(v);
      }
      if (!isPendingStatus(v.status)) return v;
    } else if (r.status === 404 || r.status === 403) {
      throw new Error(r.message);
    }
    await sleep(interval, opts.signal);
  }
}
