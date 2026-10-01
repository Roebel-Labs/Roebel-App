import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeFunctionData, parseAbi } from "viem";
import { buildEureTransfers } from "../src/lib/vorhaben/rails/safe-batch";
import { pollSafeLine, proposeSafeBatch, type SafeKit, type SafeRailDeps } from "../src/lib/vorhaben/rails/safe";
import type { LineRow } from "../src/lib/vorhaben/repo";

test("builds one EURe transfer per line with 18-decimal amounts", () => {
  const txs = buildEureTransfers([
    { recipient_wallet: "0x00000000000000000000000000000000000000bb", amount: "5", asset: "EURe" },
    { recipient_wallet: "0xbcabbaa26420e0a4771808f9639d4176355e5d4b", amount: "0.25", asset: "EURe" },
  ]);
  assert.equal(txs.length, 2);
  assert.equal(txs[0].to.toLowerCase(), "0x420ca0f9b9b604ce0fd9c18ef134c705e5fa3430");
  const d = decodeFunctionData({ abi: parseAbi(["function transfer(address,uint256)"]), data: txs[1].data });
  assert.equal(d.args[1], 25n * 10n ** 16n);
});

test("refuses lines without a wallet or with another asset", () => {
  assert.throws(() => buildEureTransfers([{ recipient_wallet: null, amount: "5", asset: "EURe" }]));
  assert.throws(() => buildEureTransfers([{ recipient_wallet: "0x00000000000000000000000000000000000000bb", amount: "5", asset: "MUENZEN" }]));
});

function line(p: Partial<LineRow>): LineRow {
  return { id: "l1", contract_id: "c", proposal_id: "p", role: "aufgabe", recipient_wallet: "0x00000000000000000000000000000000000000bb", recipient_label: "Ben", amount: "5",
    asset: "EURe", rail: "safe_eure", reference_type: "task", reference_id: "t1", status: "vorgeschlagen", error: null,
    attempt_started_at: null, safe_tx_hash: "0xsafe", safe_nonce: 7, tx_hash: null, ...p };
}

/** Fake honouring eq/in CAS filters; rpc claim/release mimic the SQL functions. */
function fakeDb(rows: LineRow[]) {
  const afterSettled: string[] = [];
  const db = {
    afterSettled,
    rpc: async (fn: string, a: { p_line_id: string; p_error?: string }) => {
      const r = rows.find((x) => x.id === a.p_line_id);
      if (fn === "claim_payout_line") {
        if (r && r.status === "geplant") { r.status = "sendend"; return { data: [r], error: null }; }
        return { data: [], error: null };
      }
      if (r && r.status === "sendend" && !r.safe_tx_hash) { r.status = "geplant"; r.error = a.p_error ?? null; }
      return { data: null, error: null };
    },
    from(table: string) {
      return {
        update(patch: Record<string, unknown>) {
          const filters: Array<(r: LineRow) => boolean> = [];
          const b: any = {
            eq(c: string, v: string) { filters.push((r: any) => r[c] === v); return b; },
            in(c: string, v: string[]) { filters.push((r: any) => v.includes(r[c])); return b; },
            select() { return b; },
            then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) {
              let matched: LineRow[] = [];
              if (table === "proposal_payout_lines") { matched = rows.filter((r) => filters.every((f) => f(r))); for (const r of matched) Object.assign(r, patch); }
              else if (table === "proposal_tasks") afterSettled.push("task");
              return Promise.resolve({ data: matched.map((r) => ({ id: r.id })), error: null }).then(res, rej);
            },
          };
          return b;
        },
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { proposal_id: "0xkey" }, error: null }) }) }),
        upsert: async () => ({ error: null }), insert: async () => ({ error: null }),
      };
    },
  };
  return db;
}

type Tx = Awaited<ReturnType<SafeKit["getTx"]>>;
function deps(tx: Tx, onchain: number, rows: LineRow[], over: Partial<SafeKit> = {}, receipt: "success" | "reverted" | "pending" = "success"): SafeRailDeps & { db: ReturnType<typeof fakeDb>; proposed: string[]; notified: string[] } {
  const proposed: string[] = []; const notified: string[] = [];
  const kit: SafeKit = { nextNonce: async () => 7, hashFor: async () => ({ safeTxHash: "0xsafe", safeTransactionData: {} }),
    propose: async (h) => { proposed.push(h); }, getTx: async () => tx, ...over };
  return { kit, nowMs: () => 1e12, onchainNonce: async () => onchain, notifyOwners: async (p: string) => { notified.push(p); },
    receiptStatus: async () => receipt, db: fakeDb(rows) as never, proposed, notified } as never;
}

test("executed successfully → bestaetigt with the execution hash, afterLineSettled once", async () => {
  const rows = [line({})];
  const d = deps({ isExecuted: true, isSuccessful: true, transactionHash: "0xexec" }, 8, rows);
  await pollSafeLine(d, rows[0]);
  assert.equal(rows[0].status, "bestaetigt");
  assert.equal(rows[0].tx_hash, "0xexec");
  assert.deepEqual(d.db.afterSettled, ["task"]);
  await pollSafeLine(d, { ...rows[0], status: "vorgeschlagen" }); // a late duplicate poll loses the CAS
  assert.deepEqual(d.db.afterSettled, ["task"]);
});

test("executed but receipt still pending → hash stored, not yet bestaetigt", async () => {
  const rows = [line({})];
  await pollSafeLine(deps({ isExecuted: true, isSuccessful: true, transactionHash: "0xexec" }, 8, rows, {}, "pending"), rows[0]);
  assert.equal(rows[0].status, "vorgeschlagen");
  assert.equal(rows[0].tx_hash, "0xexec");
});

test("executed but unsuccessful → fehlgeschlagen", async () => {
  const rows = [line({})];
  await pollSafeLine(deps({ isExecuted: true, isSuccessful: false, transactionHash: "0xexec" }, 8, rows), rows[0]);
  assert.equal(rows[0].status, "fehlgeschlagen");
});

test("nonce used by another tx → fehlgeschlagen (replaced)", async () => {
  const rows = [line({})];
  await pollSafeLine(deps({ isExecuted: false, isSuccessful: null, transactionHash: null }, 8, rows), rows[0]);
  assert.equal(rows[0].status, "fehlgeschlagen");
  assert.equal(rows[0].error, "replaced");
});

test("still pending at the current nonce → unchanged", async () => {
  const rows = [line({})];
  await pollSafeLine(deps({ isExecuted: false, isSuccessful: null, transactionHash: null }, 7, rows), rows[0]);
  assert.equal(rows[0].status, "vorgeschlagen");
});

test("sendend + service knows the hash → vorgeschlagen", async () => {
  const rows = [line({ status: "sendend" })];
  await pollSafeLine(deps({ isExecuted: false, isSuccessful: null, transactionHash: null }, 7, rows), rows[0]);
  assert.equal(rows[0].status, "vorgeschlagen");
});

test("sendend, unknown to the service and stale → reset to geplant", async () => {
  const rows = [line({ status: "sendend", attempt_started_at: new Date(1e12 - 11 * 60 * 1000).toISOString() })];
  await pollSafeLine(deps(null, 7, rows), rows[0]);
  assert.equal(rows[0].status, "geplant");
  assert.equal(rows[0].safe_tx_hash, null);
  assert.equal(rows[0].error, "propose_failed");
});

test("proposeSafeBatch stores the hash, proposes, marks vorgeschlagen, notifies", async () => {
  const rows = [line({ id: "a", status: "geplant", safe_tx_hash: null, safe_nonce: null }), line({ id: "b", role: "plattform", status: "geplant", safe_tx_hash: null, safe_nonce: null })];
  const d = deps(null, 7, rows);
  await proposeSafeBatch(d, rows);
  assert.deepEqual(rows.map((r) => [r.status, r.safe_tx_hash, r.safe_nonce]), [["vorgeschlagen", "0xsafe", 7], ["vorgeschlagen", "0xsafe", 7]]);
  assert.deepEqual(d.proposed, ["0xsafe"]);
  assert.deepEqual(d.notified, ["p"]);
});

test("proposeSafeBatch releases the batch when a claim loses", async () => {
  const rows = [line({ id: "a", status: "geplant", safe_tx_hash: null }), line({ id: "b", status: "sendend", safe_tx_hash: null })];
  const d = deps(null, 7, rows);
  await proposeSafeBatch(d, rows);
  assert.equal(rows[0].status, "geplant");
  assert.deepEqual(d.proposed, []);
});

test("propose failure keeps lines sendend with the hash stored", async () => {
  const rows = [line({ status: "geplant", safe_tx_hash: null, safe_nonce: null })];
  const d = deps(null, 7, rows, { propose: async () => { throw new Error("timeout"); } });
  await assert.rejects(proposeSafeBatch(d, rows));
  assert.equal(rows[0].status, "sendend");
  assert.equal(rows[0].safe_tx_hash, "0xsafe");
});
