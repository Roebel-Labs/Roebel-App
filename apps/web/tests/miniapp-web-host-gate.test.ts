// apps/web/tests/miniapp-web-host-gate.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { gateWalletRequest } from "../src/lib/miniapp-host/walletGate";

function counters(answer = true) {
  const c = { asked: 0, forwarded: 0 };
  const p = {
    confirm: async () => {
      c.asked++;
      return answer;
    },
    forward: async () => {
      c.forwarded++;
      return "0x";
    },
  };
  return { c, p };
}

test("eth_signTypedData_v3 asks for confirmation", async () => {
  const { c, p } = counters(true);
  await gateWalletRequest({ method: "eth_signTypedData_v3", params: [] }, p);
  assert.equal(c.asked, 1);
  assert.equal(c.forwarded, 1);
});

test("a declined confirmation never reaches the wallet", async () => {
  const { c, p } = counters(false);
  await assert.rejects(gateWalletRequest({ method: "personal_sign", params: ["0x", "0x"] }, p), (e: { code?: string }) => e.code === "user_rejected");
  assert.equal(c.asked, 1);
  assert.equal(c.forwarded, 0);
});

test("an unknown method never reaches the wallet", async () => {
  const { c, p } = counters(true);
  await assert.rejects(gateWalletRequest({ method: "wallet_grantPermissions", params: [] }, p), (e: { code?: string }) => e.code === "unsupported");
  assert.equal(c.asked, 0);
  assert.equal(c.forwarded, 0);
});

test("eth_accounts is forwarded without a confirmation", async () => {
  const { c, p } = counters(true);
  const out = await gateWalletRequest({ method: "eth_accounts" }, p);
  assert.equal(out, "0x");
  assert.equal(c.asked, 0);
  assert.equal(c.forwarded, 1);
});

test("thrown errors carry a message so the bridge keeps their code", async () => {
  const { p } = counters(false);
  await assert.rejects(gateWalletRequest({ method: "eth_sign", params: [] }, p), (e: { code?: string; message?: string }) => e.code === "user_rejected" && typeof e.message === "string");
  await assert.rejects(gateWalletRequest({ method: "foo_bar" }, p), (e: { code?: string; message?: string }) => e.code === "unsupported" && typeof e.message === "string");
});
