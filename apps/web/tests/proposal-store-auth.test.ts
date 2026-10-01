import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeAbiParameters, encodeEventTopics, parseAbi, parseAbiParameters } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { recoverMessageAddress } from "viem";
import {
  authorizeProposalStore, buildProposalStoreMessage, canonicalStorePayload, type StoreAuthDeps, type StoreReceipt,
} from "../src/lib/proposal-store-auth";
import { GOVERNOR } from "../src/lib/vorhaben/constants";

const signer = privateKeyToAccount(("0x" + "11".repeat(32)) as `0x${string}`);
const PROPOSER = signer.address.toLowerCase();
const TX = ("0x" + "cd".repeat(32)) as `0x${string}`;
const ID = "123456789012345678901234567890";
const content = { title: "Bank am Hafen", markdown: "# Bank\nText", category: "general", budgetAmount: " 150 ", beneficiaryName: "Verein" };

const abi = parseAbi([
  "event ProposalCreated(uint256 proposalId, address proposer, address[] targets, uint256[] values, string[] signatures, bytes[] calldatas, uint256 voteStart, uint256 voteEnd, string description)",
]);
function proposalCreatedLog(id: bigint, proposer: string, address: string = GOVERNOR) {
  return {
    address,
    topics: encodeEventTopics({ abi, eventName: "ProposalCreated" }) as `0x${string}`[],
    data: encodeAbiParameters(
      parseAbiParameters("uint256, address, address[], uint256[], string[], bytes[], uint256, uint256, string"),
      [id, proposer as `0x${string}`, [], [], [], [], 100n, 200n, "desc"],
    ),
  };
}
const receipt = (logs = [proposalCreatedLog(BigInt(ID), PROPOSER)], status: "success" | "reverted" = "success"): StoreReceipt =>
  ({ status, blockNumber: 42n, logs });

const realVerify: StoreAuthDeps["verifySignature"] = async (w, m, s) =>
  (await recoverMessageAddress({ message: m, signature: s as `0x${string}` })).toLowerCase() === w.toLowerCase();

async function body(over: Record<string, unknown> = {}) {
  const signature = await signer.signMessage({ message: buildProposalStoreMessage(ID, content) });
  return { proposalId: TX, transactionHash: TX, blockchainProposalId: ID, proposerAddress: signer.address, signature, ...content, ...over };
}
const deps = (over: Partial<StoreAuthDeps> = {}): StoreAuthDeps => ({ getReceipt: async () => receipt(), verifySignature: realVerify, ...over });

test("canonical payload: sorted keys, trimmed optional fields, missing → null", () => {
  assert.equal(canonicalStorePayload({ title: "T", markdown: "M" }),
    '{"beneficiaryName":null,"budgetAmount":null,"category":null,"markdown":"M","title":"T"}');
  assert.equal(canonicalStorePayload({ title: "T", markdown: "M", budgetAmount: " 5 ", beneficiaryName: "" }),
    '{"beneficiaryName":null,"budgetAmount":"5","category":null,"markdown":"M","title":"T"}');
  assert.match(buildProposalStoreMessage("7", { title: "T", markdown: "M" }), /^roebel-proposal-store-v1:7:0x[0-9a-f]{64}$/);
});

test("valid tx + proposer signature → ok with on-chain block data", async () => {
  const r = await authorizeProposalStore(deps(), await body());
  assert.deepEqual(r, { ok: true, proposer: PROPOSER, blockNumber: 42n, voteStart: 100n, voteEnd: 200n });
});

test("content changed after signing (e.g. a bigger budget) → 401", async () => {
  const r = await authorizeProposalStore(deps(), await body({ budgetAmount: "15000" }));
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.status, 401);
});

test("someone else's tx: proposer in the event differs → 400", async () => {
  const other = "0x" + "9".repeat(40);
  const r = await authorizeProposalStore(deps({ getReceipt: async () => receipt([proposalCreatedLog(BigInt(ID), other)]) }), await body());
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.status, 400);
});

test("wrong proposal id, foreign contract, reverted tx → 400", async () => {
  for (const rc of [
    receipt([proposalCreatedLog(1n, PROPOSER)]),
    receipt([proposalCreatedLog(BigInt(ID), PROPOSER, "0x" + "7".repeat(40))]),
    receipt(undefined, "reverted"),
  ]) {
    const r = await authorizeProposalStore(deps({ getReceipt: async () => rc }), await body());
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.status, 400);
  }
});

test("signature by a different wallet → 401; missing signature → 401", async () => {
  const mallory = privateKeyToAccount(("0x" + "22".repeat(32)) as `0x${string}`);
  const sig = await mallory.signMessage({ message: buildProposalStoreMessage(ID, content) });
  const r1 = await authorizeProposalStore(deps(), await body({ signature: sig }));
  assert.equal(r1.ok, false);
  if (!r1.ok) assert.equal(r1.status, 401);
  const r2 = await authorizeProposalStore(deps(), await body({ signature: undefined }));
  assert.equal(r2.ok, false);
  if (!r2.ok) assert.equal(r2.status, 401);
});

test("malformed ids and a transactionHash that differs from proposalId → 400", async () => {
  for (const over of [{ proposalId: "0x1234" }, { blockchainProposalId: "abc" }, { proposerAddress: "nope" },
    { transactionHash: "0x" + "ef".repeat(32) }]) {
    const r = await authorizeProposalStore(deps(), await body(over));
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.status, 400);
  }
});

test("unknown tx or RPC/verifier down → 503 (retryable), never ok", async () => {
  const r1 = await authorizeProposalStore(deps({ getReceipt: async () => null }), await body());
  const r2 = await authorizeProposalStore(deps({ getReceipt: async () => { throw new Error("down"); } }), await body());
  const r3 = await authorizeProposalStore(deps({ verifySignature: async () => { throw new Error("down"); } }), await body());
  for (const r of [r1, r2, r3]) { assert.equal(r.ok, false); if (!r.ok) assert.equal(r.status, 503); }
});
