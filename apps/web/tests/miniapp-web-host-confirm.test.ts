// apps/web/tests/miniapp-web-host-confirm.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeFunctionData, parseAbi, toFunctionSelector } from "viem";
import { confirmText } from "../src/lib/miniapp-host/confirmText";

const TARGET = "0xAbC0000000000000000000000000000000000001";
const OTHER = "0x0000000000000000000000000000000000000002";
const CHECK_IN = encodeFunctionData({
  abi: parseAbi(["function checkIn(uint256)"]),
  functionName: "checkIn",
  args: [1n],
});
const sel = (sig: string) => toFunctionSelector(`function ${sig}`);
const app = {
  name: "Fitness",
  contracts: [{ address: TARGET.toLowerCase(), label: "Trainingsbuch", functions: ["checkIn(uint256)"] }],
};
const send = (to: string, data: string) => ({ method: "eth_sendTransaction", params: [{ to, data }] });

test("a declared call is shown by label and function", () => {
  const text = confirmText(app, send(TARGET, CHECK_IN), sel);
  assert.match(text, /Fitness/);
  assert.match(text, /eth_sendTransaction/);
  assert.match(text, /Trainingsbuch · checkIn/);
  assert.doesNotMatch(text, /NICHT ANGEMELDET/);
});

test("an undeclared call is flagged with its address", () =>
  assert.match(confirmText(app, send(OTHER, "0xdeadbeef"), sel), /NICHT ANGEMELDET · 0x0000000000000000000000000000000000000002/));

test("a declared address with an undeclared function is flagged", () =>
  assert.match(confirmText(app, send(TARGET, "0xdeadbeef"), sel), /NICHT ANGEMELDET · 0xAbC0/));

test("every call of wallet_sendCalls gets a line", () => {
  const text = confirmText(
    app,
    {
      method: "wallet_sendCalls",
      params: [{ calls: [{ to: TARGET, data: CHECK_IN }, { to: OTHER, data: "0x" }, { to: TARGET, data: CHECK_IN }] }],
    },
    sel,
  );
  const lines = text.split("\n").filter((l) => / · /.test(l));
  assert.equal(lines.length, 3);
  assert.match(lines[0], /^1\. Trainingsbuch · checkIn/);
  assert.match(lines[1], /^2\. NICHT ANGEMELDET · 0x0000/);
  assert.match(lines[2], /^3\. Trainingsbuch · checkIn/);
});

test("an app without a declaration flags every call; a signature lists no calls", () => {
  assert.match(confirmText({ name: "Alt" }, send(TARGET, CHECK_IN), sel), /NICHT ANGEMELDET/);
  const sign = confirmText(app, { method: "personal_sign", params: ["0x68656c6c6f", TARGET] }, sel);
  assert.match(sign, /personal_sign/);
  assert.doesNotMatch(sign, / · /);
});
