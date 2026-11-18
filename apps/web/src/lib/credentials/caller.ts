// Who is calling a credential route: the Röbel App (wallet signature or passkey API session,
// both through verifySignedRequest) or a paired Ortis Studio / browser session (chat session JWT).
// A pairing session is weaker than the phone, so it may never fetch proofs, claim signatures or
// presentations, nor report a transaction (APP_ONLY_ACTIONS).
// Relative imports only: loaded by `npx tsx --test`.
import { CREDENTIALS_SCOPE, type CredentialAction } from "../signed-request/message";
import { verifySignedRequest, type VerifyFail } from "../signed-request/verify";
import { bearerToken, verifySessionToken } from "../chat/session";

export type Caller = {
  ok: true;
  wallet: string;
  via: "signature" | "passkey_session" | "chat_session";
  action: CredentialAction;
  payload: Record<string, unknown>;
};

export const APP_ONLY_ACTIONS: readonly CredentialAction[] = ["mine", "redeem", "respond", "present_create", "action_submitted", "badge_nudge"];

/** Actions of /api/credentials/org (dashboard, Studio and app), including the plan-4 event badge actions. */
export const ORG_ACTIONS: readonly CredentialAction[] = [
  "types_list",
  "type_prepare",
  "delegate_prepare",
  "members_public_prepare",
  "orgs_list",
  "actions_list",
  "people_list",
  "people_search",
  "people_preview",
  "batch_prepare",
  "revoke_prepare",
  "letters",
  "delegates_list",
  "event_badges_list",
  "event_badge_setup",
  "event_badge_get",
  "event_badge_prepare",
  "event_badge_auto",
];

const PASSKEY_TOKEN_PREFIX = "pst1.";

type HeaderBag = { get(n: string): string | null };

export async function authenticateCaller(
  request: { headers: HeaderBag },
  body: unknown,
  actions: readonly CredentialAction[],
  deps: {
    verifySigned?: typeof verifySignedRequest;
    verifyChatToken?: (t: string | null) => Promise<string | null>;
  } = {},
): Promise<Caller | VerifyFail> {
  const token = bearerToken(request.headers.get("authorization"));

  if (token && !token.startsWith(PASSKEY_TOKEN_PREFIX)) {
    const wallet = await (deps.verifyChatToken ?? ((t) => verifySessionToken(t)))(token);
    if (!wallet) return { ok: false, status: 401, code: "SESSION_INVALID", message: "Die Sitzung ist abgelaufen. Bitte erneut verbinden." };
    const b = (body ?? {}) as Record<string, unknown>;
    const action = b.action;
    if (typeof action !== "string" || !actions.includes(action as CredentialAction)) {
      return { ok: false, status: 400, code: "BAD_REQUEST", message: "Unbekannte Aktion." };
    }
    if (APP_ONLY_ACTIONS.includes(action as CredentialAction)) {
      return { ok: false, status: 403, code: "APP_ONLY", message: "Das geht nur in der Röbel App." };
    }
    const payload = b.payload && typeof b.payload === "object" && !Array.isArray(b.payload) ? (b.payload as Record<string, unknown>) : {};
    return { ok: true, wallet: wallet.toLowerCase(), via: "chat_session", action: action as CredentialAction, payload };
  }

  const r = await (deps.verifySigned ?? verifySignedRequest)<CredentialAction>(body, {
    scope: CREDENTIALS_SCOPE,
    actions,
    headers: request.headers,
  });
  if (!r.ok) return r;
  return { ok: true, wallet: r.wallet, via: token ? "passkey_session" : "signature", action: r.action, payload: r.payload };
}
