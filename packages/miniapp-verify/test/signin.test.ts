import { test } from "node:test";
import assert from "node:assert/strict";
import { verifySignIn, MiniAppVerifyError } from "../src/index.ts";

const ADDR = "0x" + "11".repeat(20);
const SIG = "0x" + "ab".repeat(65);

function message(o: { domain?: string; address?: string; chainId?: number; nonce?: string; issuedAt?: string } = {}) {
  return [
    `${o.domain ?? "app.example"} wants you to sign in with your Ethereum account:`,
    o.address ?? ADDR,
    "",
    "Bei Demo anmelden",
    "",
    `URI: https://${o.domain ?? "app.example"}/`,
    "Version: 1",
    `Chain ID: ${o.chainId ?? 100}`,
    `Nonce: ${o.nonce ?? "abcdef123456"}`,
    `Issued At: ${o.issuedAt ?? new Date().toISOString()}`,
  ].join("\n");
}

function token(msg: string, address = ADDR, signature = SIG): string {
  return "nzsi1." + Buffer.from(JSON.stringify({ address, message: msg, signature }), "utf8").toString("base64url");
}

function fakeClient(valid = true) {
  const calls: any[] = [];
  return {
    calls,
    client: {
      async verifyHash(a: any) {
        calls.push(a);
        return valid;
      },
      async readContract() {
        return false;
      },
    } as any,
  };
}

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    assert.ok(e instanceof MiniAppVerifyError, String(e));
    return e.code;
  }
  return "no error";
}

test("a fresh sign-in token for the right domain returns the address", async () => {
  const { client, calls } = fakeClient();
  const r = await verifySignIn(token(message()), { domain: "app.example", nonce: "abcdef123456", client });
  assert.deepEqual(r, { address: ADDR });
  assert.equal(calls.length, 1);
});

test("another domain, a stale Issued At, a wrong nonce and a wrong chain are refused", async () => {
  const { client } = fakeClient();
  assert.equal(await code(verifySignIn(token(message({ domain: "evil.example" })), { domain: "app.example", client })), "wrong_domain");
  const stale = new Date(Date.now() - 10 * 60_000).toISOString();
  assert.equal(await code(verifySignIn(token(message({ issuedAt: stale })), { domain: "app.example", client })), "expired");
  assert.equal(await code(verifySignIn(token(message()), { domain: "app.example", nonce: "otherNonce99", client })), "wrong_nonce");
  assert.equal(await code(verifySignIn(token(message({ chainId: 8453 })), { domain: "app.example", client })), "wrong_chain");
});

test("an address line that differs from the token address, a bad prefix or a bad signature are refused", async () => {
  const { client } = fakeClient();
  const other = "0x" + "33".repeat(20);
  assert.equal(await code(verifySignIn(token(message({ address: other })), { domain: "app.example", client })), "malformed");
  assert.equal(await code(verifySignIn("nzsi2.abc", { domain: "app.example", client })), "malformed");
  assert.equal(await code(verifySignIn(token(message()), { domain: "app.example", client: fakeClient(false).client })), "bad_signature");
});
