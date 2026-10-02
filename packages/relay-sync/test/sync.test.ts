import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { buildBindingEvent, deriveNostrIdentity } from "@netizen-labs/nostr";
import { parseAllowList, renderAllowList, writeAllowList } from "../src/allowlist.js";
import { syncAllowList } from "../src/sync.js";
import type { ChainVerifier, RegistryRow } from "../src/types.js";

function identityFor(seed: string) {
  return deriveNostrIdentity("0x" + seed.repeat(65).slice(0, 130));
}

const ALICE = identityFor("a1");
const BOB = identityFor("b2");
const ALICE_WALLET = "0x1111111111111111111111111111111111111111";
const BOB_WALLET = "0x2222222222222222222222222222222222222222";

function rowFor(identity: ReturnType<typeof identityFor>, wallet: string): RegistryRow {
  return {
    wallet_address: wallet,
    pubkey_hex: identity.publicKey,
    npub: identity.npub,
    eth_signature: "0x" + "ab".repeat(65),
    binding_event: buildBindingEvent(identity.secretKey, wallet, { createdAt: 1_753_600_000 }),
    revoked_at: null,
  };
}

const permissiveChain: ChainVerifier = {
  verifyWalletSignature: async () => true,
  holdsCitizenNft: async () => true,
};

describe("allow-list rendering", () => {
  it("writes one lowercase pubkey per line under a generated header", () => {
    const rendered = renderAllowList([ALICE.publicKey.toUpperCase(), BOB.publicKey]);
    const lines = rendered.split("\n");
    assert.ok(lines[0].startsWith("#"), "keeps a comment header the awk policy ignores");
    assert.deepEqual(parseAllowList(rendered).sort(), [ALICE.publicKey, BOB.publicKey].sort());
    assert.ok(rendered.endsWith("\n"), "trailing newline so appends stay well-formed");
  });

  it("dedupes and sorts for a stable diff", () => {
    const rendered = renderAllowList([BOB.publicKey, ALICE.publicKey, BOB.publicKey]);
    const entries = parseAllowList(rendered);
    assert.equal(entries.length, 2);
    assert.deepEqual(entries, [...entries].sort());
  });

  it("renders an empty list as header-only", () => {
    assert.deepEqual(parseAllowList(renderAllowList([])), []);
  });
});

describe("atomic write", () => {
  it("creates the file, then reports unchanged on an identical rewrite", async () => {
    const dir = await mkdtemp(join(tmpdir(), "netizen-allowlist-"));
    const path = join(dir, "citizens.txt");

    assert.equal(await writeAllowList(path, [ALICE.publicKey]), true);
    assert.deepEqual(parseAllowList(await readFile(path, "utf8")), [ALICE.publicKey]);

    assert.equal(await writeAllowList(path, [ALICE.publicKey]), false, "no spurious rewrite");
    assert.equal(await writeAllowList(path, [ALICE.publicKey, BOB.publicKey]), true);
    assert.equal(parseAllowList(await readFile(path, "utf8")).length, 2);
  });

  it("replaces a hand-written file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "netizen-allowlist-"));
    const path = join(dir, "citizens.txt");
    await writeFile(path, "# handwritten\n" + BOB.publicKey + "\n", "utf8");

    await writeAllowList(path, [ALICE.publicKey]);
    assert.deepEqual(parseAllowList(await readFile(path, "utf8")), [ALICE.publicKey]);
  });
});

describe("sync pass", () => {
  it("writes exactly the verified members", async () => {
    const written: string[][] = [];
    const summary = await syncAllowList({
      fetchRegistry: async () => [rowFor(ALICE, ALICE_WALLET), rowFor(BOB, BOB_WALLET)],
      chain: permissiveChain,
      allowListPath: "/unused",
      write: async (_path, pubkeys) => {
        written.push(pubkeys);
        return true;
      },
    });

    assert.equal(summary.allowed, 2);
    assert.equal(summary.checked, 2);
    assert.deepEqual(written[0].sort(), [ALICE.publicKey, BOB.publicKey].sort());
  });

  it("lists a non-citizen as member only; citizens go to both lists", async () => {
    const writes: Record<string, string[]> = {};
    const summary = await syncAllowList({
      fetchRegistry: async () => [rowFor(ALICE, ALICE_WALLET), rowFor(BOB, BOB_WALLET)],
      chain: {
        ...permissiveChain,
        holdsCitizenNft: async (address) => address === ALICE_WALLET,
      },
      allowListPath: "/members",
      citizensPath: "/citizens",
      write: async (path, pubkeys) => {
        writes[path] = pubkeys;
        return true;
      },
    });
    assert.deepEqual(writes["/members"].sort(), [ALICE.publicKey, BOB.publicKey].sort());
    assert.deepEqual(writes["/citizens"], [ALICE.publicKey]);
    assert.equal(summary.allowed, 2);
    assert.equal(summary.citizens, 1);
    assert.deepEqual(summary.rejected, []);
  });

  it("a revoked row is in neither list", async () => {
    const writes: Record<string, string[]> = {};
    const summary = await syncAllowList({
      fetchRegistry: async () => [
        rowFor(ALICE, ALICE_WALLET),
        { ...rowFor(BOB, BOB_WALLET), revoked_at: "2026-07-27T10:00:00Z" },
      ],
      chain: permissiveChain,
      allowListPath: "/members",
      citizensPath: "/citizens",
      write: async (path, pubkeys) => {
        writes[path] = pubkeys;
        return true;
      },
    });
    assert.deepEqual(writes["/members"], [ALICE.publicKey]);
    assert.deepEqual(writes["/citizens"], [ALICE.publicKey]);
    assert.deepEqual(summary.rejected, [{ wallet: BOB_WALLET, reason: "revoked" }]);
  });

  it("an NFT RPC failure keeps the member, drops the citizen, and the pass continues", async () => {
    const writes: Record<string, string[]> = {};
    await syncAllowList({
      fetchRegistry: async () => [rowFor(ALICE, ALICE_WALLET), rowFor(BOB, BOB_WALLET)],
      chain: {
        ...permissiveChain,
        holdsCitizenNft: async (address) => {
          if (address === BOB_WALLET) throw new Error("gnosis rpc down");
          return true;
        },
      },
      allowListPath: "/members",
      citizensPath: "/citizens",
      write: async (path, pubkeys) => {
        writes[path] = pubkeys;
        return true;
      },
    });
    assert.deepEqual(writes["/members"].sort(), [ALICE.publicKey, BOB.publicKey].sort());
    assert.deepEqual(writes["/citizens"], [ALICE.publicKey]);
  });

  it("writes the real files atomically", async () => {
    const dir = await mkdtemp(join(tmpdir(), "netizen-sync-"));
    await syncAllowList({
      fetchRegistry: async () => [rowFor(ALICE, ALICE_WALLET), rowFor(BOB, BOB_WALLET)],
      chain: { ...permissiveChain, holdsCitizenNft: async (a) => a === ALICE_WALLET },
      allowListPath: join(dir, "members.txt"),
      citizensPath: join(dir, "citizens.txt"),
    });
    assert.equal(parseAllowList(await readFile(join(dir, "members.txt"), "utf8")).length, 2);
    assert.deepEqual(parseAllowList(await readFile(join(dir, "citizens.txt"), "utf8")), [
      ALICE.publicKey,
    ]);
  });

  it("keeps a valid member when another row is malformed", async () => {
    const written: string[][] = [];
    await syncAllowList({
      fetchRegistry: async () => [
        rowFor(ALICE, ALICE_WALLET),
        { ...rowFor(BOB, BOB_WALLET), wallet_address: "junk" },
      ],
      chain: permissiveChain,
      allowListPath: "/unused",
      write: async (_path, pubkeys) => {
        written.push(pubkeys);
        return true;
      },
    });
    assert.deepEqual(written[0], [ALICE.publicKey]);
  });
});

describe("paths and logs", () => {
  it("refuses identical members/citizens paths", async () => {
    await assert.rejects(
      syncAllowList({
        fetchRegistry: async () => [],
        chain: permissiveChain,
        allowListPath: "/etc/strfry/citizens.txt",
        citizensPath: "/etc/strfry/../strfry/citizens.txt",
      }),
      /CITIZENS_PATH must differ from ALLOWLIST_PATH/,
    );
  });

  it("logs per-file state and warns when every NFT check failed", async () => {
    const logs: string[] = [];
    await syncAllowList({
      fetchRegistry: async () => [rowFor(ALICE, ALICE_WALLET), rowFor(BOB, BOB_WALLET)],
      chain: {
        ...permissiveChain,
        holdsCitizenNft: async () => {
          throw new Error("rpc down");
        },
      },
      allowListPath: "/m",
      citizensPath: "/c",
      log: (m) => logs.push(m),
      write: async (path) => path === "/m",
    });
    assert.ok(logs.some((l) => /members list updated/.test(l)));
    assert.ok(logs.some((l) => /citizens list unchanged/.test(l)));
    assert.ok(logs.some((l) => /WARNING: every CitizenNFT check failed/.test(l)));
  });

  it("uses distinct headers per list", async () => {
    const dir = await mkdtemp(join(tmpdir(), "netizen-hdr-"));
    await writeAllowList(join(dir, "m.txt"), [], "members");
    await writeAllowList(join(dir, "c.txt"), [], "citizens");
    assert.match(await readFile(join(dir, "m.txt"), "utf8"), /MEMBERS list/);
    assert.match(await readFile(join(dir, "c.txt"), "utf8"), /CITIZENS list/);
  });
});

describe("fail-closed", () => {
  it("does not touch the allow-list when the registry fetch fails", async () => {
    let wrote = false;
    await assert.rejects(
      syncAllowList({
        fetchRegistry: async () => {
          throw new Error("supabase 503");
        },
        chain: permissiveChain,
        allowListPath: "/unused",
        write: async () => {
          wrote = true;
          return true;
        },
      }),
      /supabase 503/,
    );
    assert.equal(wrote, false, "a Supabase outage must never empty the allow-list");
  });

  it("does not touch the allow-list when an RPC call fails mid-pass", async () => {
    let wrote = false;
    await assert.rejects(
      syncAllowList({
        fetchRegistry: async () => [rowFor(ALICE, ALICE_WALLET), rowFor(BOB, BOB_WALLET)],
        chain: {
          ...permissiveChain,
          verifyWalletSignature: async ({ address }) => {
            if (address === BOB_WALLET) throw new Error("gnosis rpc down");
            return true;
          },
        },
        allowListPath: "/unused",
        write: async () => {
          wrote = true;
          return true;
        },
      }),
      /gnosis rpc down/,
    );
    assert.equal(wrote, false, "a partial pass must not be written as if it were complete");
  });

  it("leaves an existing file byte-identical when a pass aborts", async () => {
    const dir = await mkdtemp(join(tmpdir(), "netizen-allowlist-"));
    const path = join(dir, "citizens.txt");
    await writeAllowList(path, [ALICE.publicKey, BOB.publicKey]);
    const before = await readFile(path, "utf8");

    await assert.rejects(
      syncAllowList({
        fetchRegistry: async () => {
          throw new Error("network unreachable");
        },
        chain: permissiveChain,
        allowListPath: path,
      }),
    );

    assert.equal(await readFile(path, "utf8"), before);
  });
});

describe("agent keys on the allow-list", () => {
  const AGENT = identityFor("c3");

  it("keeps declared agent keys through a pass that would otherwise erase them", async () => {
    // The bug this prevents: a pass rewrites the allow-list from the citizen
    // registry alone. An agent's key — NIP-06 derived from an agent smart account
    // that holds NO CitizenNFT — would be deleted on the next tick, so an agent
    // could never keep write access to its own community's relay.
    let written: string[] = [];
    const summary = await syncAllowList({
      fetchRegistry: async () => [rowFor(ALICE, ALICE_WALLET)],
      chain: permissiveChain,
      allowListPath: "/unused",
      alwaysAllow: [AGENT.publicKey],
      write: async (_p, keys) => {
        written = keys;
        return true;
      },
    });
    assert.ok(written.includes(AGENT.publicKey), "agent key survives the rewrite");
    assert.ok(written.includes(ALICE.publicKey), "citizens still admitted");
    assert.equal(summary.allowed, 1);
    assert.equal(summary.agents, 1);
  });

  it("drops malformed agent entries instead of writing them", async () => {
    // strfry reads this file on every event, so a single bad line is a policy
    // bug for the whole town. Better to lose one agent than corrupt the list.
    const logs: string[] = [];
    let written: string[] = [];
    await syncAllowList({
      fetchRegistry: async () => [],
      chain: permissiveChain,
      allowListPath: "/unused",
      alwaysAllow: ["not-a-pubkey", "", AGENT.publicKey.toUpperCase()],
      log: (m) => logs.push(m),
      write: async (_p, keys) => {
        written = keys;
        return true;
      },
    });
    // Case-normalised, so an operator pasting an uppercase key still works.
    assert.deepEqual(written, [AGENT.publicKey.toLowerCase()]);
    assert.ok(logs.some((l) => /ignoring malformed alwaysAllow entry: not-a-pubkey/.test(l)));
  });

  it("still fails closed: a registry outage never writes an agent-only list", async () => {
    // Agent keys must not become a backdoor around the fail-closed rule — if the
    // registry is down, writing [agents] alone would revoke the entire town.
    let wrote = false;
    await assert.rejects(
      syncAllowList({
        fetchRegistry: async () => {
          throw new Error("supabase 503");
        },
        chain: permissiveChain,
        allowListPath: "/unused",
        alwaysAllow: [AGENT.publicKey],
        write: async () => {
          wrote = true;
          return true;
        },
      }),
    );
    assert.equal(wrote, false, "allow-list left untouched");
  });
});
