import assert from "node:assert/strict";
import { test } from "node:test";
import { parseMuenzenAmount, topupErrorMessage } from "../src/lib/muenzen/topup";

const E18 = 10n ** 18n;

test("parses whole and decimal amounts with comma or dot", () => {
  assert.deepEqual(parseMuenzenAmount("12"), { ok: true, atto: 12n * E18 });
  assert.deepEqual(parseMuenzenAmount("12,5"), { ok: true, atto: 125n * 10n ** 17n });
  assert.deepEqual(parseMuenzenAmount(" 0.05 "), { ok: true, atto: 5n * 10n ** 16n });
  assert.deepEqual(parseMuenzenAmount("1.234,56"), { ok: true, atto: 123456n * 10n ** 16n });
});

test("rejects empty, zero, garbage and >2 decimals", () => {
  for (const bad of ["", "0", "0,00", "abc", "-1", "1,234", "1e3", "1,2,3"]) {
    assert.equal(parseMuenzenAmount(bad).ok, false, bad);
  }
});

test("rejects amounts above the balance", () => {
  const r = parseMuenzenAmount("10,01", 10n * E18);
  assert.equal(r.ok, false);
  assert.deepEqual(parseMuenzenAmount("10", 10n * E18), { ok: true, atto: 10n * E18 });
});

test("maps errors to German messages", () => {
  assert.equal(topupErrorMessage(new Error("User rejected the request")), "Abgebrochen.");
  assert.match(topupErrorMessage(new Error("ERC1155: insufficient balance")), /Zu wenig/);
  assert.match(topupErrorMessage(new Error("Failed to fetch")), /Netzwerkfehler/);
});
