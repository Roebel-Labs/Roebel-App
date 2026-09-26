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
    process.env.PASSKEY_EMAIL_ENABLED = "1";
    delete process.env.PASSKEY_EMAIL_STORE;
    const r = await alertsRoute(req("Bearer s3cret"));
    assert.equal(r.status, 503);
    assert.deepEqual(await r.json(), { error: "store_not_persistent" });
    delete process.env.CRON_SECRET;
    assert.equal((await alertsRoute(req("Bearer undefined"))).status, 401);
  } finally {
    process.env = keep;
  }
});
