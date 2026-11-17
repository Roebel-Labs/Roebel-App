/**
 * Recovery alert scan + GET /api/passkey/recovery-alerts guards.
 * Run: cd apps/web && npx tsx --test src/lib/passkey/__tests__/recovery-alerts.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeAbiParameters, encodeEventTopics, decodeEventLog, keccak256, toHex, type Address } from "viem";
import { InMemoryEmailStore } from "../email-store";
import type { Mailer, OutgoingMail } from "../email-mailer";
import { formatDeadline, recoveryAlertMail } from "../email-mailer";
import {
  ALERT_CURSOR_ID,
  RECOVERY_EXECUTED_EVENT,
  runRecoveryAlerts,
  type RecoveryExecutedLog,
  type RecoveryLogReader,
} from "../recovery-alerts";
import { GET as alertsRoute } from "../../../app/api/passkey/recovery-alerts/route";
import { createSupabaseAlertPush, recoveryAlertPush, type AlertPush } from "../alert-push";

const W1: Address = "0x1111111111111111111111111111111111111111";
const W2: Address = "0x2222222222222222222222222222222222222222";
const NOW = 1_790_000_000;
const LATER = BigInt(NOW + 2 * 86_400);

function reader(head: bigint, logs: RecoveryExecutedLog[]): RecoveryLogReader & { ranges: [bigint, bigint][] } {
  const ranges: [bigint, bigint][] = [];
  return {
    ranges,
    latestBlock: async () => head,
    async recoveryExecuted(from, to) {
      ranges.push([from, to]);
      return logs.filter((l) => l.blockNumber >= from && l.blockNumber <= to);
    },
  };
}

function mailer(failTimes = 0): Mailer & { sent: OutgoingMail[] } {
  const sent: OutgoingMail[] = [];
  let fails = failTimes;
  return {
    sent,
    async send(m) {
      if (fails-- > 0) throw new Error("resend down");
      sent.push(m);
    },
  };
}

async function storeWith(...contacts: [Address, string, boolean?][]) {
  const s = new InMemoryEmailStore(() => NOW);
  for (const [w, e, verified = true] of contacts) {
    if (verified) await s.saveVerifiedContact(w, e, NOW - 100);
    else s.contacts.set(w.toLowerCase(), { safe: w.toLowerCase(), email: e, emailVerifiedAt: null, alertsEnabled: true });
  }
  return s;
}

test("the event signature matches the verified SRM ABI", () => {
  const [topic0] = encodeEventTopics({ abi: [RECOVERY_EXECUTED_EVENT], eventName: "RecoveryExecuted" });
  assert.equal(topic0, keccak256(toHex("RecoveryExecuted(address,address[],uint256,uint256,uint64,uint256)")));
  const data = encodeAbiParameters(
    [{ type: "uint256" }, { type: "uint256" }, { type: "uint64" }, { type: "uint256" }],
    [1n, 7n, LATER, 2n],
  );
  const topics = encodeEventTopics({ abi: [RECOVERY_EXECUTED_EVENT], eventName: "RecoveryExecuted", args: { wallet: W1 } });
  const decoded = decodeEventLog({
    abi: [RECOVERY_EXECUTED_EVENT],
    data,
    topics: [topics[0], topics[1] as `0x${string}`, `0x${"ab".repeat(32)}`],
  });
  assert.equal(decoded.args.wallet, W1);
  assert.equal(decoded.args.nonce, 7n);
  assert.equal(decoded.args.executeAfter, LATER);
});

test("alert text: German, names the deadline and the settings screen, no login wording", () => {
  const m = recoveryAlertMail("a@example.de", LATER);
  assert.equal(m.subject, "Jemand stellt dein Konto wieder her");
  assert.match(m.text, /Jemand stellt dein Konto wieder her\. Du hast bis .* Uhr Zeit, das abzubrechen: öffne die App → Passkey & Wiederherstellung\./);
  assert.ok(m.text.includes(formatDeadline(LATER)));
  assert.match(formatDeadline(1_790_000_000), /2026/);
});

test("first run: looks back from head, alerts verified contacts once, advances the cursor", async () => {
  const store = await storeWith([W1, "one@example.de"], [W2, "two@example.de", false]);
  const r = reader(100_000n, [
    { wallet: W1, nonce: 3n, executeAfter: LATER, blockNumber: 99_000n },
    { wallet: W2, nonce: 1n, executeAfter: LATER, blockNumber: 99_100n }, // unverified: no mail
  ]);
  const m = mailer();
  const res = await runRecoveryAlerts({ reader: r, store, mailer: m, nowSec: () => NOW, lookbackBlocks: 60_000n, confirmations: 5n });
  assert.equal(res.fromBlock, String(100_000n - 5n - 60_000n));
  assert.equal(res.toBlock, String(100_000n - 5n));
  assert.equal(res.events, 2);
  assert.equal(res.sent, 1);
  assert.equal(res.skipped.noContact, 1);
  assert.deepEqual(m.sent.map((x) => x.to), ["one@example.de"]);
  assert.equal(await store.getCursor(ALERT_CURSOR_ID), 99_995n);

  // Same range again (cursor reset): the claim stops a second mail for the same recovery nonce.
  await store.setCursor(ALERT_CURSOR_ID, 90_000n);
  const again = await runRecoveryAlerts({ reader: r, store, mailer: m, nowSec: () => NOW });
  assert.equal(again.sent, 0);
  assert.equal(again.skipped.alreadySent, 1);
  assert.equal(m.sent.length, 1);

  // A NEW recovery (next nonce) for the same wallet alerts again.
  const r2 = reader(100_100n, [{ wallet: W1, nonce: 4n, executeAfter: LATER, blockNumber: 100_050n }]);
  const third = await runRecoveryAlerts({ reader: r2, store, mailer: m, nowSec: () => NOW });
  assert.equal(third.sent, 1);
});

test("recoveries whose delay is already over are skipped; alerts-off contacts are skipped", async () => {
  const store = await storeWith([W1, "one@example.de"], [W2, "two@example.de"]);
  store.contacts.get(W2.toLowerCase())!.alertsEnabled = false;
  const r = reader(1_000n, [
    { wallet: W1, nonce: 1n, executeAfter: BigInt(NOW - 1), blockNumber: 500n },
    { wallet: W2, nonce: 1n, executeAfter: LATER, blockNumber: 600n },
  ]);
  const m = mailer();
  const res = await runRecoveryAlerts({ reader: r, store, mailer: m, nowSec: () => NOW });
  assert.equal(res.sent, 0);
  assert.equal(res.skipped.windowOver, 1);
  assert.equal(res.skipped.noContact, 1);
});

test("a failed send releases the claim and holds the cursor, so the next run retries", async () => {
  const store = await storeWith([W1, "one@example.de"]);
  await store.setCursor(ALERT_CURSOR_ID, 1_000n);
  const r = reader(30_000n, [{ wallet: W1, nonce: 9n, executeAfter: LATER, blockNumber: 15_000n }]);
  const m = mailer(1);
  const res = await runRecoveryAlerts({ reader: r, store, mailer: m, nowSec: () => NOW, chunkBlocks: 10_000n, confirmations: 0n });
  assert.equal(res.failed, 1);
  assert.equal(res.sent, 0);
  // Chunk 1 (1001..11000) was clean and advanced; chunk 2 (with the failure) did not.
  assert.equal(await store.getCursor(ALERT_CURSOR_ID), 11_000n);
  const retry = await runRecoveryAlerts({ reader: r, store, mailer: m, nowSec: () => NOW, chunkBlocks: 10_000n, confirmations: 0n });
  assert.equal(retry.sent, 1);
  assert.equal(await store.getCursor(ALERT_CURSOR_ID), 30_000n);
});

test("scans in chunks, at most maxBlocksPerRun per run, and nothing when caught up", async () => {
  const store = await storeWith();
  await store.setCursor(ALERT_CURSOR_ID, 0n);
  const r = reader(50_000n, []);
  await runRecoveryAlerts({ reader: r, store, mailer: mailer(), nowSec: () => NOW, chunkBlocks: 10_000n, maxBlocksPerRun: 25_000n, confirmations: 0n, lookbackBlocks: 60_000n });
  assert.deepEqual(r.ranges, [[1n, 10_000n], [10_001n, 20_000n], [20_001n, 25_000n]]);
  assert.equal(await store.getCursor(ALERT_CURSOR_ID), 25_000n);

  await store.setCursor(ALERT_CURSOR_ID, 50_000n);
  const idle = await runRecoveryAlerts({ reader: r, store, mailer: mailer(), nowSec: () => NOW, confirmations: 0n });
  assert.equal(idle.fromBlock, null);
});

test("after a long outage the scan jumps to the lookback window", async () => {
  const store = await storeWith();
  await store.setCursor(ALERT_CURSOR_ID, 10n);
  const r = reader(1_000_000n, []);
  const res = await runRecoveryAlerts({ reader: r, store, mailer: mailer(), nowSec: () => NOW, confirmations: 0n, lookbackBlocks: 60_000n });
  assert.equal(res.fromBlock, String(1_000_000n - 60_000n));
});

test("route: CRON_SECRET bearer required; disabled / non-persistent store answer 503", async () => {
  const keep = { ...process.env };
  try {
    process.env.CRON_SECRET = "s3cret";
    delete process.env.PASSKEY_EMAIL_ENABLED;
    const req = (auth?: string) =>
      new Request("http://localhost/api/passkey/recovery-alerts", { headers: auth ? { authorization: auth } : {} });
    assert.equal((await alertsRoute(req())).status, 401);
    assert.equal((await alertsRoute(req("Bearer wrong"))).status, 401);
    assert.equal((await alertsRoute(req("Bearer s3cret"))).status, 503);
    process.env.PASSKEY_PUSH_ALERTS_ENABLED = "1";
    delete process.env.PASSKEY_EMAIL_STORE;
    const pushOnly = await alertsRoute(req("Bearer s3cret"));
    assert.equal(pushOnly.status, 503);
    assert.deepEqual(await pushOnly.json(), { error: "store_not_persistent" });
    delete process.env.PASSKEY_PUSH_ALERTS_ENABLED;
    process.env.PASSKEY_EMAIL_ENABLED = "1";
    const r = await alertsRoute(req("Bearer s3cret"));
    assert.equal(r.status, 503);
    assert.deepEqual(await r.json(), { error: "store_not_persistent" });
    delete process.env.CRON_SECRET;
    assert.equal((await alertsRoute(req("Bearer undefined"))).status, 401);
  } finally {
    process.env = keep;
  }
});

// ---- Push alerts (Sovereign Sign-up 2, Task 7) ----

const WALLET: Address = "0x3333333333333333333333333333333333333333";
const nowSec = () => NOW;

/** Head 1 000; every event sits at block 500, inside the first-run lookback. */
function readerWith(logs: RecoveryExecutedLog[]): RecoveryLogReader {
  return {
    latestBlock: async () => 1_000n,
    recoveryExecuted: async (from, to) => logs.filter((l) => l.blockNumber >= from && l.blockNumber <= to),
  };
}

function ev(wallet: Address, nonce: bigint): RecoveryExecutedLog {
  return { wallet, nonce, executeAfter: LATER, blockNumber: 500n };
}

/** Forgets the scan cursor so the next run reads the same blocks again (only the claims protect). */
function freshCursor(store: InMemoryEmailStore): InMemoryEmailStore {
  store.cursors.delete(ALERT_CURSOR_ID);
  return store;
}

function fakePush(tokens: Record<string, string[]>, failTimes = 0): AlertPush & { sent: { tokens: string[]; title: string; body: string; data: Record<string, string> }[] } {
  const sent: { tokens: string[]; title: string; body: string; data: Record<string, string> }[] = [];
  let fails = failTimes;
  return {
    sent,
    tokensFor: async (wallet) => tokens[wallet] ?? tokens[wallet.toLowerCase()] ?? [],
    async send(t, message) {
      if (fails-- > 0) throw new Error("expo down");
      sent.push({ tokens: t, ...message });
    },
  };
}

test("a wallet without an email still gets a push, once per recovery nonce", async () => {
  const store = await storeWith();
  const push = fakePush({ [WALLET]: ["ExponentPushToken[a]"] });
  const r1 = await runRecoveryAlerts({ reader: readerWith([ev(WALLET, 1n)]), store, push, nowSec });
  assert.equal(r1.pushed, 1);
  assert.equal(r1.sent, 0);
  assert.deepEqual(push.sent[0].tokens, ["ExponentPushToken[a]"]);
  assert.equal(push.sent[0].title, "Jemand stellt dein Konto wieder her");
  assert.deepEqual(push.sent[0].data, { type: "passkey_recovery" });
  const r2 = await runRecoveryAlerts({ reader: readerWith([ev(WALLET, 1n)]), store: freshCursor(store), push, nowSec });
  assert.equal(r2.pushed, 0);
  assert.equal(r2.skipped.alreadySent, 1);
  const r3 = await runRecoveryAlerts({ reader: readerWith([ev(WALLET, 2n)]), store: freshCursor(store), push, nowSec });
  assert.equal(r3.pushed, 1); // a second attempt after a cancel alerts again
  assert.equal(push.sent.length, 2);
});

test("email and push are claimed separately; a failed push is retried without a second email", async () => {
  const store = await storeWith([WALLET, "w@example.de"]);
  const m = mailer();
  const push = fakePush({ [WALLET]: ["ExponentPushToken[a]"] }, 1);
  const first = await runRecoveryAlerts({ reader: readerWith([ev(WALLET, 5n)]), store, mailer: m, push, nowSec });
  assert.equal(first.sent, 1);
  assert.equal(first.pushed, 0);
  assert.equal(first.failed, 1);
  assert.equal(await store.getCursor(ALERT_CURSOR_ID), null); // cursor held
  assert.equal(first.toBlock, null);

  const next = await runRecoveryAlerts({ reader: readerWith([ev(WALLET, 5n)]), store, mailer: m, push, nowSec });
  assert.equal(next.sent, 0);
  assert.equal(next.pushed, 1);
  assert.equal(next.failed, 0);
  assert.equal(next.skipped.alreadySent, 1); // the email claim
  assert.equal(m.sent.length, 1);
  assert.equal(push.sent.length, 1);
  assert.equal(await store.getCursor(ALERT_CURSOR_ID), 995n);
});

test("a failed email does not stop the push, and its retry sends no second push", async () => {
  const store = await storeWith([WALLET, "w@example.de"]);
  const m = mailer(1);
  const push = fakePush({ [WALLET]: ["ExponentPushToken[a]"] });
  const first = await runRecoveryAlerts({ reader: readerWith([ev(WALLET, 6n)]), store, mailer: m, push, nowSec });
  assert.deepEqual([first.sent, first.pushed, first.failed], [0, 1, 1]);
  const next = await runRecoveryAlerts({ reader: readerWith([ev(WALLET, 6n)]), store, mailer: m, push, nowSec });
  assert.deepEqual([next.sent, next.pushed, next.failed], [1, 0, 0]);
  assert.equal(push.sent.length, 1);
});

test("no device and no email: skipped, cursor advances", async () => {
  const store = await storeWith();
  const m = mailer();
  const push = fakePush({});
  const r = await runRecoveryAlerts({ reader: readerWith([ev(WALLET, 1n)]), store, mailer: m, push, nowSec });
  assert.equal(r.skipped.noDevice, 1);
  assert.equal(r.skipped.noContact, 1);
  assert.equal(r.failed, 0);
  assert.equal(r.sent + r.pushed, 0);
  assert.equal(await store.getCursor(ALERT_CURSOR_ID), 995n);
  assert.equal(store.alerts.size, 0); // nothing claimed
});

test("the in-memory store claims the same (wallet, nonce) once per channel", async () => {
  const store = new InMemoryEmailStore(() => NOW);
  assert.equal(await store.claimAlert(WALLET, 1n, LATER), true);
  assert.equal(await store.claimAlert(WALLET, 1n, LATER, "email"), false);
  assert.equal(await store.claimAlert(WALLET, 1n, LATER, "push"), true);
  assert.equal(await store.claimAlert(WALLET, 1n, LATER, "push"), false);
  await store.releaseAlert(WALLET, 1n, "push");
  assert.equal(await store.claimAlert(WALLET, 1n, LATER, "email"), false);
  assert.equal(await store.claimAlert(WALLET, 1n, LATER, "push"), true);
});

test("push text: German, names the deadline, data type passkey_recovery", () => {
  const p = recoveryAlertPush(LATER);
  assert.equal(p.title, "Jemand stellt dein Konto wieder her");
  assert.equal(p.body, `Warst du das nicht? Öffne die App und brich es ab. Du hast bis ${formatDeadline(LATER)} Uhr Zeit.`);
  assert.deepEqual(p.data, { type: "passkey_recovery" });
});

function fakeDb(rows: { expo_push_token: string }[], fail = false) {
  const calls: { op: string; args: unknown[] }[] = [];
  const builder = () => {
    const q: Record<string, unknown> = {};
    const chain = (op: string) => (...args: unknown[]) => {
      calls.push({ op, args });
      return q;
    };
    for (const op of ["select", "eq", "update", "in"]) q[op] = chain(op);
    q.then = (resolve: (v: unknown) => void) => resolve(fail ? { data: null, error: { code: "x" } } : { data: rows, error: null });
    return q;
  };
  return { calls, db: { from: (t: string) => (calls.push({ op: "from", args: [t] }), builder()) } };
}

test("supabase push: active tokens of the wallet (lowercased), sent in chunks of 100", async () => {
  const rows = Array.from({ length: 150 }, (_, i) => ({ expo_push_token: `ExponentPushToken[${i}]` }));
  const { db, calls } = fakeDb(rows);
  const bodies: unknown[][] = [];
  const fetchImpl = (async (_url: string, init: { body: string }) => {
    const batch = JSON.parse(init.body) as unknown[];
    bodies.push(batch);
    return new Response(JSON.stringify({ data: batch.map(() => ({ status: "ok", id: "t" })) }), { status: 200 });
  }) as unknown as typeof fetch;
  const push = createSupabaseAlertPush(db as never, fetchImpl);
  const tokens = await push.tokensFor("0xABCDEFabcdef0000000000000000000000000000");
  assert.equal(tokens.length, 150);
  assert.ok(calls.some((c) => c.op === "from" && c.args[0] === "push_tokens"));
  assert.ok(calls.some((c) => c.op === "eq" && c.args[0] === "wallet_address" && c.args[1] === "0xabcdefabcdef0000000000000000000000000000"));
  assert.ok(calls.some((c) => c.op === "eq" && c.args[0] === "is_active" && c.args[1] === true));
  await push.send(tokens, recoveryAlertPush(LATER));
  assert.deepEqual(bodies.map((b) => b.length), [100, 50]);
  assert.equal((bodies[0][0] as { title: string }).title, "Jemand stellt dein Konto wieder her");
});

test("supabase push: an HTTP error or no accepted ticket throws; dead tokens are deactivated", async () => {
  const { db, calls } = fakeDb([]);
  const down = createSupabaseAlertPush(db as never, (async () => new Response("no", { status: 500 })) as unknown as typeof fetch);
  await assert.rejects(down.send(["ExponentPushToken[a]"], recoveryAlertPush(LATER)));
  const dead = createSupabaseAlertPush(
    db as never,
    (async () =>
      new Response(JSON.stringify({ data: [{ status: "error", details: { error: "DeviceNotRegistered" } }] }), { status: 200 })) as unknown as typeof fetch,
  );
  await assert.rejects(dead.send(["ExponentPushToken[dead]"], recoveryAlertPush(LATER)));
  assert.ok(calls.some((c) => c.op === "in" && (c.args[1] as string[])[0] === "ExponentPushToken[dead]"));
  // One chunk fine, the other an HTTP error: the whole push is retried (claim released).
  let call = 0;
  const partial = createSupabaseAlertPush(
    db as never,
    (async (_u: string, init: { body: string }) => {
      const batch = JSON.parse(init.body) as unknown[];
      if (call++ === 1) return new Response("no", { status: 502 });
      return new Response(JSON.stringify({ data: batch.map(() => ({ status: "ok" })) }), { status: 200 });
    }) as unknown as typeof fetch,
  );
  const many = Array.from({ length: 150 }, (_, i) => `ExponentPushToken[${i}]`);
  await assert.rejects(partial.send(many, recoveryAlertPush(LATER)));
  // An error ticket other than DeviceNotRegistered next to an accepted one also throws.
  const mixed = createSupabaseAlertPush(
    db as never,
    (async () =>
      new Response(JSON.stringify({ data: [{ status: "ok" }, { status: "error", details: { error: "MessageRateExceeded" } }] }), { status: 200 })) as unknown as typeof fetch,
  );
  await assert.rejects(mixed.send(["ExponentPushToken[a]", "ExponentPushToken[b]"], recoveryAlertPush(LATER)));
  // Accepted + DeviceNotRegistered only: sent, the dead token deactivated, no throw.
  const okDead = createSupabaseAlertPush(
    db as never,
    (async () =>
      new Response(JSON.stringify({ data: [{ status: "ok" }, { status: "error", details: { error: "DeviceNotRegistered" } }] }), { status: 200 })) as unknown as typeof fetch,
  );
  await okDead.send(["ExponentPushToken[a]", "ExponentPushToken[gone]"], recoveryAlertPush(LATER));
  assert.ok(calls.some((c) => c.op === "in" && (c.args[1] as string[])[0] === "ExponentPushToken[gone]"));
  const failing = fakeDb([], true);
  await assert.rejects(createSupabaseAlertPush(failing.db as never).tokensFor(WALLET));
});
