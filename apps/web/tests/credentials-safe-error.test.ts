import { test } from "node:test";
import assert from "node:assert/strict";
import { safeActionError } from "../src/lib/credentials/client";

test("action errors with addresses, URLs or long technical text become a fixed German line", () => {
  assert.equal(safeActionError("Das Abzeichen ist voll."), "Das Abzeichen ist voll.");
  assert.equal(safeActionError("revert from 0x00000000000000000000000000000000000000dd"), "Senden fehlgeschlagen");
  assert.equal(safeActionError("see https://rpc.example/v1/KEY"), "Senden fehlgeschlagen");
  assert.equal(safeActionError("x".repeat(200)), "Senden fehlgeschlagen");
  assert.equal(safeActionError(null), "unbekannter Fehler");
  assert.equal(safeActionError(""), "unbekannter Fehler");
});

test("the credential surfaces show only when the register is enabled and configured", async () => {
  const { credentialsVisible } = await import("../src/lib/credentials/client");
  assert.equal(credentialsVisible({ enabled: true, configured: true }), true);
  assert.equal(credentialsVisible({ enabled: true, configured: false }), false);
  assert.equal(credentialsVisible({ enabled: false, configured: true }), false);
  assert.equal(credentialsVisible(null), false);
  assert.equal(credentialsVisible({ error: "x" }), false);
});
