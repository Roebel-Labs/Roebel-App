import { test } from "node:test";
import assert from "node:assert/strict";
import { recoverMessageAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { handleIrysUpload, type IrysUploadDeps } from "./upload-handler";
import { buildIrysUploadMessage, type IrysTag } from "./upload-message";
import { MemoryLimiter } from "../rate-limit/index";

// Throwaway test key (well-known Hardhat account #0), never funded on any real network.
const signer = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const NOW = 1_790_000_000_000;
const TAGS: IrysTag[] = [{ name: "Content-Type", value: "application/json" }, { name: "App", value: "HomeTown DAO Verification" }];

async function signedBody(content: string, tags: IrysTag[] = TAGS, tsSec = NOW / 1000, who = signer) {
  const signature = await who.signMessage({ message: buildIrysUploadMessage(who.address, tsSec, content, tags) });
  return { content, tags, userAddress: who.address, auth: { timestampSec: tsSec, signature } };
}

function req(body: unknown) {
  return new Request("https://x.test/api/irys/upload", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deps(over: Partial<IrysUploadDeps> = {}): IrysUploadDeps & { uploads: { content: string; tags: IrysTag[] }[] } {
  const uploads: { content: string; tags: IrysTag[] }[] = [];
  return {
    uploads,
    verifySignature: async (wallet, message, signature) =>
      (await recoverMessageAddress({ message, signature: signature as `0x${string}` })).toLowerCase() === wallet,
    limiters: [new MemoryLimiter(100, 60_000)],
    hasKey: true,
    nowMs: () => NOW,
    upload: async (content, tags) => {
      uploads.push({ content, tags });
      return { id: "receipt123", timestamp: 1, version: "1.0.0" };
    },
    ...over,
  };
}

test("an unsigned request is refused (old unauthenticated shape)", async () => {
  const d = deps();
  const res = await handleIrysUpload(req({ content: "x", tags: TAGS, userAddress: signer.address }), d);
  assert.equal(res.status, 401);
  assert.equal(d.uploads.length, 0);
});

test("a signature over different content, by another wallet, or stale is refused", async () => {
  const d = deps();
  const body = await signedBody("original");
  assert.equal((await handleIrysUpload(req({ ...body, content: "tampered" }), d)).status, 401);
  assert.equal((await handleIrysUpload(req({ ...body, tags: [{ name: "App", value: "other" }] }), d)).status, 401);
  const other = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
  const byOther = await signedBody("original", TAGS, NOW / 1000, other);
  assert.equal((await handleIrysUpload(req({ ...byOther, userAddress: signer.address }), d)).status, 401);
  const stale = await signedBody("original", TAGS, NOW / 1000 - 3600);
  assert.equal((await handleIrysUpload(req(stale), d)).status, 401);
  assert.equal(d.uploads.length, 0);
});

test("a valid signed upload passes content and tags through and keeps the response shape", async () => {
  const d = deps();
  const res = await handleIrysUpload(req(await signedBody('{"encrypted":"abc"}')), d);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.deepEqual(json, {
    success: true,
    id: "receipt123",
    url: "https://gateway.irys.xyz/receipt123",
    receipt: { id: "receipt123", timestamp: 1, version: "1.0.0" },
  });
  assert.equal(d.uploads[0].content, '{"encrypted":"abc"}');
  assert.deepEqual(d.uploads[0].tags.slice(0, 2), TAGS);
  assert.deepEqual(d.uploads[0].tags[2], { name: "Uploader", value: signer.address });
  assert.deepEqual(d.uploads[0].tags.map((t) => t.name).slice(3), ["Timestamp", "App-Version"]);
});

test("rate-limits per wallet", async () => {
  const d = deps({ limiters: [new MemoryLimiter(1, 60_000)] });
  assert.equal((await handleIrysUpload(req(await signedBody("a")), d)).status, 200);
  assert.equal((await handleIrysUpload(req(await signedBody("b")), d)).status, 429);
  assert.equal(d.uploads.length, 1);
});

test("spoofed reserved tags, oversized content and missing key are refused", async () => {
  const d = deps();
  const spoof = await signedBody("x", [{ name: "Uploader", value: "0xsomeoneelse" }]);
  assert.equal((await handleIrysUpload(req(spoof), d)).status, 400);
  const big = await signedBody("x".repeat(1_000_001));
  assert.equal((await handleIrysUpload(req(big), d)).status, 413);
  assert.equal((await handleIrysUpload(req(await signedBody("x")), deps({ hasKey: false }))).status, 500);
  assert.equal(d.uploads.length, 0);
});
