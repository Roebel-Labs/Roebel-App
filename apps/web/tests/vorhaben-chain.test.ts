import assert from "node:assert/strict";
import { test } from "node:test";
import { listAttesters, readProposalOutcome, type ContractReader } from "../src/lib/vorhaben/chain";

const TALLY = "0x00000000000000000000000000000000000000aa";

function fakeReader(map: Record<string, (args: readonly unknown[]) => unknown>): ContractReader {
  return {
    readContract: async ({ functionName, args = [] }) => {
      const fn = map[functionName];
      if (!fn) throw new Error(`unexpected ${functionName}`);
      return fn(args);
    },
  };
}

test("reads a published tally", async () => {
  const r = fakeReader({
    state: () => 4,
    proposalDeadline: () => 1791122615n,
    proposalPolls: () => [1n, "0x01", "0x02", TALLY, 1791122615n],
    totalTallyResults: () => 3n,
    tallyResults: ([opt]) => (opt === 1n ? [7n, true] : opt === 0n ? [2n, true] : [1n, true]),
  });
  const o = await readProposalOutcome(r, 42n);
  assert.deepEqual(o, { state: 4, deadlineSec: 1791122615, tallyAddress: TALLY, tallyPublished: true,
    forVotes: 7n, againstVotes: 2n, abstainVotes: 1n });
});

test("unpublished tally reports zero votes", async () => {
  const r = fakeReader({
    state: () => 1, proposalDeadline: () => 10n,
    proposalPolls: () => [1n, "0x01", "0x02", TALLY, 10n],
    totalTallyResults: () => 0n,
  });
  const o = await readProposalOutcome(r, 42n);
  assert.equal(o.tallyPublished, false);
  assert.equal(o.forVotes, 0n);
});

test("lists attesters by scanning token ids, skipping burned ones", async () => {
  const owners: Record<string, string> = { "0": "0xAA", "2": "0xBB", "3": "0xCC" }; // 1 burned
  const r = fakeReader({
    attesterCount: () => 3n,
    ownerOf: ([id]) => { const o = owners[String(id)]; if (!o) throw new Error("ERC721NonexistentToken"); return o; },
    hasAttesterNFT: () => true,
  });
  assert.deepEqual(await listAttesters(r), ["0xaa", "0xbb", "0xcc"]);
});
