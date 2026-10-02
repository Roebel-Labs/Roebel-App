import { writeAllowList } from "./allowlist.js";
import type { ChainVerifier, RegistryRow, SyncSummary } from "./types.js";
import { verifyRegistryRow } from "./verify.js";

export interface SyncDeps {
  /** Fetch the private registry. Must THROW on failure — see the fail-closed rule. */
  fetchRegistry: () => Promise<RegistryRow[]>;
  chain: ChainVerifier;
  /** Members list: every bound, signature-valid, non-revoked account (+ alwaysAllow). */
  allowListPath: string;
  /** Citizens list: members that also hold a CitizenNFT. Skipped when unset. */
  citizensPath?: string;
  log?: (message: string) => void;
  /** Injectable for tests. */
  write?: (path: string, pubkeys: string[]) => Promise<boolean>;
  /**
   * Non-citizen pubkeys that must survive every pass — in practice the node's own
   * AI agents (`agents.a2a`), whose Nostr key is NIP-06 derived from an agent
   * smart account that holds no CitizenNFT.
   *
   * Without this, an agent key added to the allow-list is DELETED on the next
   * sync: the pass rewrites the file from the citizen registry alone, so an agent
   * could never keep write access to its own community's relay. Agents are
   * members of this node, so their keys are declared in the manifest and unioned
   * in here — never hand-added to a generated file that is about to be rewritten.
   *
   * They are declared, not verified on-chain: an operator putting a key in the
   * manifest IS the authorisation, and it is auditable in git.
   */
  alwaysAllow?: string[];
}

const HEX64 = /^[0-9a-f]{64}$/;

/**
 * One sync pass: registry → verified members → allow-list.
 *
 * **Fail-closed rule.** If the registry fetch or any RPC call fails, this throws
 * and the allow-list is left exactly as it was. The alternative — treating an
 * error as "no members" — would let one Supabase outage or one flaky RPC write an
 * empty file and revoke write access for the entire town. A stale allow-list is a
 * far better failure than an empty one.
 *
 * Revocation is not a special case: a revoked row fails verification and is absent
 * from both lists; losing the NFT drops the key from the citizens list only.
 */
export async function syncAllowList(deps: SyncDeps): Promise<SyncSummary> {
  const log = deps.log ?? (() => {});
  const write = deps.write ?? writeAllowList;

  const rows = await deps.fetchRegistry();
  log(`registry: ${rows.length} row(s)`);

  const allowed: string[] = [];
  const citizens: string[] = [];
  const rejected: SyncSummary["rejected"] = [];

  for (const row of rows) {
    const outcome = await verifyRegistryRow(row, deps.chain, log);
    if (outcome.allowed) {
      allowed.push(outcome.pubkey);
      if (outcome.citizen) citizens.push(outcome.pubkey);
    } else rejected.push({ wallet: outcome.wallet, reason: outcome.reason });
  }

  // Declared agent keys are unioned in AFTER verification — they are authorised by
  // being in the manifest, not by holding a CitizenNFT. Malformed entries are
  // dropped loudly rather than written: strfry reads this file on every event, so
  // one bad line is a policy bug for the whole town.
  const agentKeys: string[] = [];
  for (const raw of deps.alwaysAllow ?? []) {
    const key = raw.trim().toLowerCase();
    if (HEX64.test(key)) agentKeys.push(key);
    else log(`  ignoring malformed alwaysAllow entry: ${raw}`);
  }

  // Everything is computed before the first write, so an abort leaves both files untouched.
  const membersChanged = await write(deps.allowListPath, [...allowed, ...agentKeys]);
  const citizensChanged = deps.citizensPath
    ? await write(deps.citizensPath, citizens)
    : false;
  const changed = membersChanged || citizensChanged;
  log(
    `verified ${allowed.length}/${rows.length}, ${citizens.length} citizen(s)` +
      (agentKeys.length ? ` (+${agentKeys.length} declared agent key(s))` : "") +
      ` — allow-list ${changed ? "updated" : "unchanged"}`,
  );
  for (const { wallet, reason } of rejected) log(`  rejected ${wallet}: ${reason}`);

  return {
    checked: rows.length,
    allowed: allowed.length,
    citizens: citizens.length,
    agents: agentKeys.length,
    rejected,
    changed,
  };
}
