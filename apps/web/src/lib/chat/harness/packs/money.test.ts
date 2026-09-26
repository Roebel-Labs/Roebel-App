import { test } from "node:test";
import assert from "node:assert/strict";
import { isToolInputError } from "../errors";
import { escapeLike, pickRecipient } from "../recipients";
import type { RecipientRow } from "../recipients";
import type { HarnessContext } from "../types";
import { moneyDeps, parseMuenzenAmount, transferMuenzen } from "./money";

const SELF = "0x" + "11".repeat(20);
const ANNA = "0x" + "aa".repeat(20);
const ANNA2 = "0x" + "ab".repeat(20);
const rows: RecipientRow[] = [
  { wallet_address: ANNA.toUpperCase().replace("0X", "0x"), username: "anna", display_name: "Anna Schulz" },
  { wallet_address: ANNA2, username: "anna_m", display_name: "Anna Schulz" },
  { wallet_address: SELF, username: "max", display_name: "Max" },
];

const ctx = {
  tenant: { id: "roebel", name: "Röbel/Müritz", region: "", timezone: "Europe/Berlin", locale: "de", appOrigin: "https://www.roebel.app", facts: [] },
  wallet: SELF, profile: null, threadId: "t", botId: "b", taskId: null, emitPart: () => {},
} as HarnessContext;

test("pickRecipient: username wins, case-insensitive, leading @", () => {
  const r = pickRecipient(rows, "@ANNA", SELF);
  assert.equal(r.wallet, ANNA);
  assert.equal(r.name, "Anna Schulz");
});

test("pickRecipient: ambiguous display name asks for the exact @username (no addresses)", () => {
  assert.throws(() => pickRecipient(rows, "anna schulz", SELF), (err: unknown) => {
    assert.ok(isToolInputError(err));
    const msg = (err as Error).message;
    assert.match(msg, /Mehrere Personen/);
    assert.match(msg, /@anna_m/);
    assert.doesNotMatch(msg, /0x/i);
    return true;
  });
});

test("pickRecipient: not found, self, and raw addresses are rejected", () => {
  assert.throws(() => pickRecipient(rows, "Berta", SELF), /Niemand/);
  assert.throws(() => pickRecipient(rows, "max", SELF), /du selbst/);
  assert.throws(() => pickRecipient(rows, ANNA, SELF), /nicht mit einer Adresse/);
  assert.throws(() => pickRecipient(rows, "  ", SELF), /Empfänger/);
});

test("pickRecipient: partial names do not match", () => {
  assert.throws(() => pickRecipient(rows, "Ann", SELF), /Niemand/);
});

test("escapeLike escapes wildcards", () => {
  assert.equal(escapeLike("a_b%c\\"), "a\\_b\\%c\\\\");
});

test("parseMuenzenAmount: valid inputs → German display", () => {
  assert.deepEqual(parseMuenzenAmount(5), { ok: true, value: 5, display: "5" });
  assert.deepEqual(parseMuenzenAmount("2,50"), { ok: true, value: 2.5, display: "2,5" });
  assert.deepEqual(parseMuenzenAmount("0.01"), { ok: true, value: 0.01, display: "0,01" });
  assert.deepEqual(parseMuenzenAmount("100"), { ok: true, value: 100, display: "100" });
  assert.equal(parseMuenzenAmount("12 Münzen").ok, true);
});

test("parseMuenzenAmount: rejects ≤ 0, > 100, > 2 decimals, junk", () => {
  for (const bad of [0, -1, "0", "100.01", 101, "1.234", "abc", "1e3", "", NaN, Infinity, null, "1,2,3"]) {
    assert.equal(parseMuenzenAmount(bad).ok, false, `expected invalid: ${String(bad)}`);
  }
  assert.equal(parseMuenzenAmount("1.230").ok, true);
});

test("transfer_muenzen: preview + summary never contain 0x; signRequest carries the wallet", async () => {
  const original = moneyDeps.resolve;
  moneyDeps.resolve = async (q) => pickRecipient(rows, q, SELF);
  try {
    const input = { recipient: "@anna", amount: "2,50" };
    const summary = transferMuenzen.summarize(input, ctx);
    const preview = await transferMuenzen.preview!(input, ctx);
    assert.doesNotMatch(summary, /0x/i);
    assert.doesNotMatch(JSON.stringify(preview), /0x/i);
    assert.equal(preview.kind, "transfer");
    const sign = await transferMuenzen.signRequest!(input, ctx);
    assert.deepEqual(sign, { kind: "muenzen_transfer", toName: "Anna Schulz", amount: "2,5", toWallet: ANNA });
    await assert.rejects(() => transferMuenzen.preview!({ recipient: "@anna", amount: 500 }, ctx), /höchstens 100/);
    await assert.rejects(() => transferMuenzen.execute(input, ctx), /Gerät/);
  } finally {
    moneyDeps.resolve = original;
  }
});

test("transfer_muenzen: schema rejects missing recipient", () => {
  assert.equal(transferMuenzen.inputSchema.safeParse({ amount: 5 }).success, false);
  assert.equal(transferMuenzen.inputSchema.safeParse({ recipient: "anna", amount: 5 }).success, true);
});
