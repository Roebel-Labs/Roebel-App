/**
 * POST /api/passkey/email/{start,verify,remove} logic, with an in-memory store, a recording mailer
 * and the offline passkey-Safe ERC-1271 emulator standing in for Gnosis.
 * Run: cd apps/web && npx tsx --test src/lib/passkey/__tests__/email-handler.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getAddress, hashMessage, type Address, type Hex } from "viem";
import { buildEmailProofMessage } from "../email-proof";
import { InMemoryEmailStore, type PasskeyEmailStore } from "../email-store";
import { FixedWindowLimiter } from "../email-rate-limit";
import type { Mailer, OutgoingMail } from "../email-mailer";
import {
  CODE_TTL_SEC,
  MAX_CODE_ATTEMPTS,
  handleEmailRemove,
  handleEmailStart,
  handleEmailVerify,
  hashCode,
  type EmailRouteDeps,
  type SafeProofVerifier,
} from "../email-handler";
import { POST as startRoute } from "../../../app/api/passkey/email/start/route";
import { POST as verifyRoute } from "../../../app/api/passkey/email/verify/route";
import { POST as removeRoute } from "../../../app/api/passkey/email/remove/route";
import { emulateSafeIsValidSignature, signAsPasskeySafe } from "./safe-1271-emulator";
import rv from "./recovery-vector.json";

const g = rv.guardianApproval;
const SAFE = getAddress(g.guardianSafe);
const T0 = 1_790_000_000;

function sign(message: string, safe: Address = SAFE): Hex {
  return signAsPasskeySafe({
    safe,
    privateKey: g.guardianPasskeyPrivateKey as Hex,
    x: g.guardianX as Hex,
    y: g.guardianY as Hex,
    hash: hashMessage(message),
    authenticatorData: g.authenticatorData as Hex,
  });
}

/** Gnosis stand-in: only SAFE is deployed, and it is the vector's guardian passkey Safe. */
function emulatedChain(opts: { deployed?: boolean; down?: boolean } = {}): SafeProofVerifier & { calls: number } {
  const v = {
    calls: 0,
    async isDeployed(safe: Address) {
      if (opts.down) throw new Error("rpc down");
      return (opts.deployed ?? true) && safe.toLowerCase() === SAFE.toLowerCase();
    },
    async verifyMessage(safe: Address, message: string, signature: Hex) {
      v.calls++;
      if (opts.down) throw new Error("rpc down");
      return emulateSafeIsValidSignature({ safe, x: g.guardianX as Hex, y: g.guardianY as Hex, hash: hashMessage(message), signature });
    },
  };
  return v;
}

function recordingMailer(fail = false): Mailer & { sent: OutgoingMail[] } {
  const sent: OutgoingMail[] = [];
  return {
    sent,
    async send(m) {
      if (fail) throw new Error("resend down");
      sent.push(m);
    },
  };
}

function setup(over: Partial<EmailRouteDeps> = {}) {
  let now = T0;
  const store = new InMemoryEmailStore(() => now);
  const mailer = recordingMailer();
  const deps: EmailRouteDeps = {
    enabled: true,
    store,
    verifier: emulatedChain(),
    mailer,
    limits: {
      safe: new FixedWindowLimiter(5, 3_600_000, () => now * 1000),
      email: new FixedWindowLimiter(3, 3_600_000, () => now * 1000),
    },
    nowSec: () => now,
    randomCode: () => "123456",
    ...over,
  };
  return { deps, store, mailer: (over.mailer as ReturnType<typeof recordingMailer>) ?? mailer, tick: (s: number) => (now += s), now: () => now };
}

const post = (body: unknown) =>
  new Request("http://localhost/api/passkey/email/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

function startBody(email = "Max@Example.de", ts = T0, safe: Address = SAFE) {
  const msg = buildEmailProofMessage({ action: "add", safe, email: email.trim().toLowerCase(), timestamp: ts });
  return { safe, email, proof: { timestamp: ts, signature: sign(msg) } };
}

function removeBody(ts = T0) {
  const msg = buildEmailProofMessage({ action: "remove", safe: SAFE, timestamp: ts });
  return { safe: SAFE, proof: { timestamp: ts, signature: sign(msg) } };
}

test("routes answer 503 unless PASSKEY_EMAIL_ENABLED=1", async () => {
  const prev = process.env.PASSKEY_EMAIL_ENABLED;
  delete process.env.PASSKEY_EMAIL_ENABLED;
  try {
    for (const route of [startRoute, verifyRoute, removeRoute]) {
      const res = await route(post({}));
      assert.equal(res.status, 503);
      assert.deepEqual(await res.json(), { error: "disabled" });
    }
  } finally {
    if (prev !== undefined) process.env.PASSKEY_EMAIL_ENABLED = prev;
  }
});

test("disabled deps: 503 on every handler", async () => {
  const { deps } = setup({ enabled: false });
  for (const h of [handleEmailStart, handleEmailVerify, handleEmailRemove]) {
    assert.equal((await h(post({}), deps)).status, 503);
  }
});

test("happy path: start sends a 6-digit code, stores only its hash; verify sets email_verified_at", async () => {
  const { deps, store, mailer, tick, now } = setup();
  const res = await handleEmailStart(post(startBody()), deps);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.expiresAt, T0 + CODE_TTL_SEC);

  assert.equal(mailer.sent.length, 1);
  assert.equal(mailer.sent[0].to, "max@example.de");
  assert.match(mailer.sent[0].text, /123456/);
  assert.match(mailer.sent[0].text, /keine Anmeldung/);

  const ch = await store.getChallenge(SAFE);
  assert.ok(ch);
  assert.equal(ch.email, "max@example.de");
  assert.equal(ch.codeHash, hashCode(SAFE, "123456"));
  assert.ok(!JSON.stringify(ch).includes("123456"), "the plain code is never stored");
  assert.equal(await store.getContact(SAFE), null, "nothing is verified yet");

  tick(30);
  const v = await handleEmailVerify(post({ safe: SAFE, code: "123456" }), deps);
  assert.equal(v.status, 200);
  assert.deepEqual(await v.json(), { ok: true, verified: true });
  assert.deepEqual(await store.getContact(SAFE), {
    safe: SAFE.toLowerCase(),
    email: "max@example.de",
    emailVerifiedAt: now(),
    alertsEnabled: true,
  });
  assert.equal(await store.getChallenge(SAFE), null, "challenge is consumed");
  // The code cannot be used twice.
  assert.equal((await handleEmailVerify(post({ safe: SAFE, code: "123456" }), deps)).status, 400);
});

test("a verified email stays until a new one is verified", async () => {
  const { deps, store } = setup();
  await handleEmailStart(post(startBody("a@example.de")), deps);
  await handleEmailVerify(post({ safe: SAFE, code: "123456" }), deps);
  await handleEmailStart(post(startBody("b@example.de", T0 + 1)), deps);
  assert.equal((await store.getContact(SAFE))?.email, "a@example.de");
  await handleEmailVerify(post({ safe: SAFE, code: "123456" }), deps);
  assert.equal((await store.getContact(SAFE))?.email, "b@example.de");
});

test("wrong code: 400 and attempts count; after MAX_CODE_ATTEMPTS the challenge is dropped", async () => {
  const { deps, store } = setup();
  await handleEmailStart(post(startBody()), deps);
  for (let i = 0; i < MAX_CODE_ATTEMPTS; i++) {
    const r = await handleEmailVerify(post({ safe: SAFE, code: "000000" }), deps);
    assert.equal(r.status, 400);
    assert.deepEqual(await r.json(), { error: "invalid_code" });
  }
  const r = await handleEmailVerify(post({ safe: SAFE, code: "123456" }), deps);
  assert.equal(r.status, 429);
  assert.deepEqual(await r.json(), { error: "too_many_attempts" });
  assert.equal(await store.getChallenge(SAFE), null);
  assert.equal(await store.getContact(SAFE), null);
});

test("expired code: 400 code_expired", async () => {
  const { deps, store, tick } = setup();
  await handleEmailStart(post(startBody()), deps);
  tick(CODE_TTL_SEC + 1);
  const r = await handleEmailVerify(post({ safe: SAFE, code: "123456" }), deps);
  assert.equal(r.status, 400);
  assert.deepEqual(await r.json(), { error: "code_expired" });
  assert.equal(await store.getContact(SAFE), null);
});

test("verify rejects malformed bodies and unknown Safes", async () => {
  const { deps } = setup();
  for (const b of [{}, { safe: SAFE }, { safe: SAFE, code: "12345" }, { safe: SAFE, code: "abcdef" }, { safe: "0x12", code: "123456" }, "not json"]) {
    assert.equal((await handleEmailVerify(post(b), deps)).status, 400, JSON.stringify(b));
  }
  const r = await handleEmailVerify(post({ safe: getAddress(rv.newSafe), code: "123456" }), deps);
  assert.equal(r.status, 400);
  assert.deepEqual(await r.json(), { error: "invalid_code" });
});

test("start rejects a proof for another email, an expired proof, junk bodies", async () => {
  const { deps, mailer } = setup();
  const b = startBody("max@example.de");
  const forged = await handleEmailStart(post({ ...b, email: "evil@example.de" }), deps);
  assert.equal(forged.status, 401);
  assert.deepEqual(await forged.json(), { error: "bad_proof" });

  const stale = await handleEmailStart(post(startBody("max@example.de", T0 - 601)), deps);
  assert.equal(stale.status, 401);
  assert.deepEqual(await stale.json(), { error: "proof_expired" });

  for (const junk of [{}, { ...b, safe: "0x1" }, { ...b, email: "nope" }, { ...b, proof: { timestamp: T0 } }, { ...b, proof: { timestamp: T0, signature: "zz" } }, "x"]) {
    assert.equal((await handleEmailStart(post(junk), deps)).status, 400, JSON.stringify(junk));
  }
  assert.equal(mailer.sent.length, 0);
});

test("start: a counterfactual Safe must deploy first (409); RPC failure is 503", async () => {
  const a = setup({ verifier: emulatedChain({ deployed: false }) });
  const r = await handleEmailStart(post(startBody()), a.deps);
  assert.equal(r.status, 409);
  assert.deepEqual(await r.json(), { error: "safe_not_deployed" });

  const b = setup({ verifier: emulatedChain({ down: true }) });
  const r2 = await handleEmailStart(post(startBody()), b.deps);
  assert.equal(r2.status, 503);
  assert.deepEqual(await r2.json(), { error: "chain_unavailable" });
});

test("start: a replayed proof is refused", async () => {
  const { deps, mailer } = setup();
  const b = startBody();
  assert.equal((await handleEmailStart(post(b), deps)).status, 200);
  const again = await handleEmailStart(post(b), deps);
  assert.equal(again.status, 409);
  assert.deepEqual(await again.json(), { error: "proof_used" });
  assert.equal(mailer.sent.length, 1);
});

test("rate limit: per Safe and per email address", async () => {
  const { deps, tick } = setup();
  // 3 per email per hour.
  for (let i = 0; i < 3; i++) assert.equal((await handleEmailStart(post(startBody("x@example.de", T0 + i)), deps)).status, 200);
  const r = await handleEmailStart(post(startBody("x@example.de", T0 + 3)), deps);
  assert.equal(r.status, 429);
  assert.deepEqual(await r.json(), { error: "rate_limited" });
  // 5 per Safe per hour (2 left for other addresses, then refused).
  assert.equal((await handleEmailStart(post(startBody("y@example.de", T0 + 4)), deps)).status, 200);
  assert.equal((await handleEmailStart(post(startBody("z@example.de", T0 + 5)), deps)).status, 200);
  assert.equal((await handleEmailStart(post(startBody("w@example.de", T0 + 6)), deps)).status, 429);
  tick(3601);
  assert.equal((await handleEmailStart(post(startBody("w@example.de", T0 + 3601)), deps)).status, 200);
});

test("start: when the email cannot be sent, no challenge is left behind (502)", async () => {
  const { deps, store } = setup({ mailer: recordingMailer(true) });
  const r = await handleEmailStart(post(startBody()), deps);
  assert.equal(r.status, 502);
  assert.deepEqual(await r.json(), { error: "send_failed" });
  assert.equal(await store.getChallenge(SAFE), null);
});

test("remove: needs a fresh remove proof, then deletes the contact and any open challenge", async () => {
  const { deps, store } = setup();
  await handleEmailStart(post(startBody()), deps);
  await handleEmailVerify(post({ safe: SAFE, code: "123456" }), deps);
  await handleEmailStart(post(startBody("other@example.de", T0 + 1)), deps);

  // An add proof does not authorize a remove.
  const addProof = startBody().proof;
  assert.equal((await handleEmailRemove(post({ safe: SAFE, proof: addProof }), deps)).status, 401);
  assert.equal((await handleEmailRemove(post(removeBody(T0 - 700)), deps)).status, 401);
  assert.ok(await store.getContact(SAFE));

  const r = await handleEmailRemove(post(removeBody()), deps);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true });
  assert.equal(await store.getContact(SAFE), null);
  assert.equal(await store.getChallenge(SAFE), null);
});

test("store failure is 503, never a crash", async () => {
  const broken = new Proxy(new InMemoryEmailStore(), {
    get(target, prop) {
      const v = (target as any)[prop];
      return typeof v === "function" ? async () => { throw new Error("db down"); } : v;
    },
  }) as PasskeyEmailStore;
  const { deps } = setup({ store: broken });
  assert.equal((await handleEmailStart(post(startBody()), deps)).status, 503);
  assert.equal((await handleEmailVerify(post({ safe: SAFE, code: "123456" }), deps)).status, 503);
  assert.equal((await handleEmailRemove(post(removeBody()), deps)).status, 503);
});

test("nothing is logged that carries the email or the code", async () => {
  const logs: string[] = [];
  const orig = { log: console.log, warn: console.warn, error: console.error, info: console.info };
  const capture = (...a: unknown[]) => logs.push(a.map(String).join(" "));
  Object.assign(console, { log: capture, warn: capture, error: capture, info: capture });
  try {
    const a = setup({ mailer: recordingMailer(true) });
    await handleEmailStart(post(startBody("leak@example.de")), a.deps);
    const b = setup({ verifier: emulatedChain({ down: true }) });
    await handleEmailStart(post(startBody("leak@example.de")), b.deps);
    const c = setup();
    await handleEmailStart(post(startBody("leak@example.de")), c.deps);
    await handleEmailVerify(post({ safe: SAFE, code: "999999" }), c.deps);
  } finally {
    Object.assign(console, orig);
  }
  const all = logs.join("\n");
  assert.ok(!all.includes("leak@example.de"), all);
  assert.ok(!all.includes("123456") && !all.includes("999999"), all);
});

test("no newsletter write path: the email modules never reference users.email or newsletter tables", () => {
  const dir = join(__dirname, "..");
  for (const f of ["email-proof.ts", "email-store.ts", "email-store-supabase.ts", "email-handler.ts", "email-mailer.ts", "recovery-alerts.ts"]) {
    const src = readFileSync(join(dir, f), "utf8");
    assert.ok(!/newsletter_subscribers/.test(src), `${f} mentions newsletter_subscribers`);
    assert.ok(!/from\(\s*["']users["']\s*\)/.test(src), `${f} writes the users table`);
  }
});
