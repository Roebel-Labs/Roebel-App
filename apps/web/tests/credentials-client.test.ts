import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { buildSignedMessage, CREDENTIALS_SCOPE } from "../src/lib/signed-request/message";
import { credentialsRequest, pollAction, type ActionView } from "../src/lib/credentials/client";

const WALLET = "0x00000000000000000000000000000000000000A1";
const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

function account() {
  const signed: string[] = [];
  return {
    signed,
    address: WALLET,
    signMessage: async ({ message }: { message: string }) => {
      signed.push(message);
      return `0x${"ab".repeat(65)}`;
    },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

test("credentialsRequest signs scope:action:wallet:ts:hash and posts to /api/credentials/<route>", async () => {
  const acc = account();
  const calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    return jsonResponse({ ok: true, data: [{ accountId: "x" }] });
  }) as typeof fetch;

  const r = await credentialsRequest<{ accountId: string }[]>(acc, "org", "orgs_list", { client: "dashboard" });
  assert.deepEqual(r, { ok: true, data: [{ accountId: "x" }] });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/credentials/org");
  assert.equal(calls[0].init.method, "POST");
  const body = JSON.parse(String(calls[0].init.body));
  assert.equal(body.scope, CREDENTIALS_SCOPE);
  assert.equal(body.action, "orgs_list");
  assert.equal(body.wallet, WALLET.toLowerCase());
  assert.deepEqual(body.payload, { client: "dashboard" });
  assert.equal(typeof body.timestampSec, "number");
  assert.ok(Math.abs(body.timestampSec - Date.now() / 1000) < 5);
  assert.equal(acc.signed.length, 1);
  assert.equal(acc.signed[0], buildSignedMessage(CREDENTIALS_SCOPE, "orgs_list", WALLET, body.timestampSec, { client: "dashboard" }));
  assert.equal(body.signature, `0x${"ab".repeat(65)}`);
});

test("credentialsRequest passes a server failure through with its status", async () => {
  globalThis.fetch = (async () => jsonResponse({ ok: false, code: "ORG_NOT_ON_CHAIN", message: "nicht eingetragen" }, 409)) as typeof fetch;
  const r = await credentialsRequest(account(), "org", "types_list", { accountId: "a" });
  assert.deepEqual(r, { ok: false, code: "ORG_NOT_ON_CHAIN", message: "nicht eingetragen", status: 409 });
});

test("a network failure returns NETWORK_ERROR and does not throw", async () => {
  globalThis.fetch = (async () => {
    throw new TypeError("Failed to fetch");
  }) as typeof fetch;
  const r = await credentialsRequest(account(), "actions", "action_get", { actionId: "x" });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.code, "NETWORK_ERROR");
    assert.equal(r.status, 0);
    assert.equal(typeof r.message, "string");
  }
  // A signature refused by the wallet is not a throw either.
  const refusing = { address: WALLET, signMessage: async () => Promise.reject(new Error("user rejected")) };
  const r2 = await credentialsRequest(refusing, "org", "orgs_list", {});
  assert.equal(r2.ok, false);
  // A non-JSON answer (proxy error page) is not a throw either.
  globalThis.fetch = (async () => new Response("<html>502</html>", { status: 502 })) as typeof fetch;
  const r3 = await credentialsRequest(account(), "org", "orgs_list", {});
  assert.equal(r3.ok, false);
  if (!r3.ok) assert.equal(r3.status, 502);
});

function view(status: ActionView["status"], extra: Partial<ActionView> = {}): ActionView {
  return {
    id: "6f1c2a7e-0d3b-4c55-9a1e-2b3c4d5e6f70",
    status,
    summary: { title: "3 Ausweise ausstellen: Mitglied", lines: ["Unbefristet gültig"], orgName: "Heimatverein" },
    expiresAt: "2026-11-24T10:00:00.000Z",
    error: null,
    ...extra,
  };
}

for (const terminal of ["done", "failed", "cancelled", "expired"] as const) {
  test(`pollAction stops at ${terminal} and reports every change once`, async () => {
    const sequence = [view("awaiting_confirmation"), view("awaiting_confirmation"), view("submitted"), view("submitted"), view(terminal), view("done")];
    let i = 0;
    const actions: string[] = [];
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      actions.push(`${body.action}:${body.payload.actionId}`);
      if (i === 1) {
        i++;
        throw new TypeError("Failed to fetch"); // a dropped poll is retried, not fatal
      }
      return jsonResponse({ ok: true, data: sequence[Math.min(i++, sequence.length - 1)] });
    }) as typeof fetch;
    const seen: string[] = [];
    const last = await pollAction(account(), view("awaiting_confirmation").id, (a) => seen.push(a.status), { intervalMs: 0 });
    assert.equal(last.status, terminal);
    assert.deepEqual(seen, ["awaiting_confirmation", "submitted", terminal]);
    assert.ok(actions.every((a) => a === `action_get:${view("done").id}`));
  });
}

test("pollAction ends when its signal is aborted", async () => {
  globalThis.fetch = (async () => jsonResponse({ ok: true, data: view("awaiting_confirmation") })) as typeof fetch;
  const ctl = new AbortController();
  const p = pollAction(account(), view("done").id, () => ctl.abort(), { intervalMs: 0, signal: ctl.signal });
  await assert.rejects(p, /abgebrochen/);
});
