import { orgRoleFromIndex, type OrgRole } from "@netizen-labs/protocol";
import type { DirectoryEventName } from "./abi.js";

/**
 * Rebuild the org directory from OrgRegistry events alone.
 *
 * This is the property that makes the registry a protocol rather than a
 * backend: no database, no API, no permission — a log scan from the deploy
 * block reproduces exactly what the contract's views answer. It mirrors the
 * contract's semantics, including the generation reset on revocation (keys and
 * roles of a revoked org never resurface when the id is registered again).
 */

export interface DirectoryLog {
  eventName: DirectoryEventName;
  args: Record<string, unknown>;
  blockNumber: bigint;
  logIndex: number;
}

export interface OrgEntry {
  orgId: `0x${string}`;
  safe: `0x${string}`;
  metadataURI: string;
  /** Authorised Nostr pubkeys, x-only hex without 0x. */
  nostrKeys: Set<string>;
  roles: Map<`0x${string}`, Exclude<OrgRole, "none">>;
  registeredAtBlock: bigint;
}

export type OrgDirectory = Map<`0x${string}`, OrgEntry>;

const lc = (v: unknown) => String(v).toLowerCase() as `0x${string}`;

export function replayOrgEvents(logs: readonly DirectoryLog[]): OrgDirectory {
  const ordered = [...logs].sort((a, b) =>
    a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1,
  );
  const dir: OrgDirectory = new Map();

  for (const log of ordered) {
    const orgId = lc(log.args.orgId);
    const entry = dir.get(orgId);
    switch (log.eventName) {
      case "OrgRegistered":
        dir.set(orgId, {
          orgId,
          safe: lc(log.args.safe),
          metadataURI: "",
          nostrKeys: new Set(),
          roles: new Map(),
          registeredAtBlock: log.blockNumber,
        });
        break;
      case "OrgRevoked":
        dir.delete(orgId);
        break;
      case "SafeRotated":
        if (entry) entry.safe = lc(log.args.next);
        break;
      case "MetadataURIChanged":
        if (entry) entry.metadataURI = String(log.args.metadataURI);
        break;
      case "NostrKeySet": {
        if (!entry) break;
        const pk = lc(log.args.pubkey).replace(/^0x/, "");
        if (log.args.authorized) entry.nostrKeys.add(pk);
        else entry.nostrKeys.delete(pk);
        break;
      }
      case "RoleSet": {
        if (!entry) break;
        const role = orgRoleFromIndex(log.args.role as number | bigint);
        const account = lc(log.args.account);
        if (role === "none") entry.roles.delete(account);
        else entry.roles.set(account, role);
        break;
      }
    }
  }
  return dir;
}
