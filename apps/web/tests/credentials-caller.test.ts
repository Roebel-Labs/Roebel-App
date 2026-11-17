import { test } from "node:test";
import assert from "node:assert/strict";
import { APP_ONLY_ACTIONS, authenticateCaller } from "../src/lib/credentials/caller";
import { CREDENTIALS_SCOPE, type CredentialAction } from "../src/lib/signed-request/message";

const WALLET = "0x1111111111111111111111111111111111111111";
const ALL: CredentialAction[] = ["types_list", "orgs_list", "mine", "redeem", "respond", "present_create", "action_submitted", "holdings"];

function req(authorization?: string) {
  const h = new Map<string, string>();
  if (authorization) h.set("authorization", authorization);
  return { headers: { get: (n: string) => h.get(n.toLowerCase()) ?? null } };
}

const neverSigned = (async () => {
  throw new Error("verifySignedRequest must not be called");
}) as never;

test("a chat session token authenticates a dashboard action", async () => {
  const r = await authenticateCaller(req("Bearer chat.jwt.token"), { action: "types_list", payload: { accountId: "a" } }, ALL, {
    verifySigned: neverSigned,
    verifyChatToken: async (t) => (t === "chat.jwt.token" ? WALLET : null),
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.via, "chat_session");
  assert.equal(r.wallet, WALLET);
  assert.equal(r.action, "types_list");
  assert.deepEqual(r.payload, { accountId: "a" });
});

test("a chat session is refused for every APP_ONLY action with 403 APP_ONLY", async () => {
  assert.deepEqual([...APP_ONLY_ACTIONS].sort(), ["action_submitted", "mine", "present_create", "redeem", "respond"]);
  for (const action of APP_ONLY_ACTIONS) {
    const r = await authenticateCaller(req("Bearer chat.jwt.token"), { action, payload: {} }, ALL, {
      verifySigned: neverSigned,
      verifyChatToken: async () => WALLET,
    });
    assert.equal(r.ok, false, action);
    if (r.ok) continue;
    assert.equal(r.status, 403);
    assert.equal(r.code, "APP_ONLY");
    assert.equal(r.message, "Das geht nur in der Röbel App.");
  }
});

test("a bad bearer token is 401 and never falls through to the signature", async () => {
  const r = await authenticateCaller(
    req("Bearer forged"),
    { scope: CREDENTIALS_SCOPE, action: "types_list", wallet: WALLET, timestampSec: 1, payload: {}, signature: "0x" + "ab".repeat(65) },
    ALL,
    { verifySigned: neverSigned, verifyChatToken: async () => null },
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.status, 401);
});

test("a pst1. bearer goes to verifySignedRequest untouched", async () => {
  const body = { scope: CREDENTIALS_SCOPE, action: "mine", wallet: WALLET, timestampSec: 1, payload: { x: 1 } };
  const headers = req("Bearer pst1.abc.def").headers;
  let seen: unknown[] = [];
  const r = await authenticateCaller({ headers }, body, ALL, {
    verifySigned: (async (b: unknown, opts: unknown) => {
      seen = [b, opts];
      return { ok: true, wallet: WALLET, action: "mine", payload: { x: 1 } };
    }) as never,
    verifyChatToken: async () => {
      throw new Error("chat token must not be tried");
    },
  });
  assert.equal(seen[0], body);
  const opts = seen[1] as { scope: string; actions: readonly string[]; headers: unknown };
  assert.equal(opts.scope, CREDENTIALS_SCOPE);
  assert.equal(opts.actions, ALL);
  assert.equal(opts.headers, headers);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.via, "passkey_session");
    assert.equal(r.action, "mine");
  }
});

test("a signed request with another scope is refused", async () => {
  const r = await authenticateCaller(
    req(),
    { scope: "roebel-tickets-v1", action: "types_list", wallet: WALLET, timestampSec: Math.floor(Date.now() / 1000), payload: {}, signature: "0x" + "ab".repeat(65) },
    ALL,
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.status, 400);
});

test("an unknown action is 400 BAD_REQUEST with a German message", async () => {
  const r = await authenticateCaller(req("Bearer chat.jwt.token"), { action: "nope", payload: {} }, ALL, {
    verifySigned: neverSigned,
    verifyChatToken: async () => WALLET,
  });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.code, "BAD_REQUEST");
  assert.equal(r.message, "Unbekannte Aktion.");
});
