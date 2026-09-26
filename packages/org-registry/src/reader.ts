import { orgRoleFromIndex, pubkeyToBytes32, type OrgKeyLookup, type OrgRole } from "@netizen-labs/protocol";
import type { PublicClient } from "viem";
import { DIRECTORY_EVENTS, ORG_REGISTRY_ABI } from "./abi.js";
import { replayOrgEvents, type DirectoryLog, type OrgDirectory } from "./replay.js";

export interface OrgRegistryReaderOptions {
  client: PublicClient;
  address: `0x${string}`;
  /** Cache key-authorisation answers this long. Revocation lands after at most
   * this delay, so keep it short; 0 disables the cache. Default 60 s. */
  cacheMs?: number;
  now?: () => number;
}

export interface OrgRegistryReader {
  /** Plugs straight into `verifyOrgEvent` from @netizen-labs/protocol. */
  isNostrKeyAuthorized: OrgKeyLookup;
  isRegistered(orgId: `0x${string}`): Promise<boolean>;
  roleOf(orgId: `0x${string}`, account: `0x${string}`): Promise<OrgRole>;
  isOrgOwner(orgId: `0x${string}`, account: `0x${string}`): Promise<boolean>;
  /** Full directory from logs, deploy block to head. Chunked for public RPCs. */
  loadDirectory(fromBlock: bigint, opts?: { chunk?: bigint; toBlock?: bigint }): Promise<OrgDirectory>;
}

export function createOrgRegistryReader(options: OrgRegistryReaderOptions): OrgRegistryReader {
  const { client, address } = options;
  const cacheMs = options.cacheMs ?? 60_000;
  const now = options.now ?? Date.now;
  const cache = new Map<string, { value: boolean; at: number }>();

  const read = <T>(functionName: string, args: readonly unknown[]) =>
    client.readContract({ address, abi: ORG_REGISTRY_ABI, functionName, args } as never) as Promise<T>;

  return {
    async isNostrKeyAuthorized(orgId, pubkeyHex) {
      const key = `${orgId}:${pubkeyHex}`;
      const hit = cache.get(key);
      if (hit && now() - hit.at < cacheMs) return hit.value;
      const value = await read<boolean>("isNostrKeyAuthorized", [orgId, pubkeyToBytes32(pubkeyHex)]);
      if (cacheMs > 0) cache.set(key, { value, at: now() });
      return value;
    },
    isRegistered: (orgId) => read<boolean>("isRegistered", [orgId]),
    async roleOf(orgId, account) {
      return orgRoleFromIndex(await read<number>("roleOf", [orgId, account]));
    },
    isOrgOwner: (orgId, account) => read<boolean>("isOrgOwner", [orgId, account]),

    async loadDirectory(fromBlock, opts = {}) {
      const chunk = opts.chunk ?? 50_000n;
      const head = opts.toBlock ?? (await client.getBlockNumber());
      const logs: DirectoryLog[] = [];
      const events = ORG_REGISTRY_ABI.filter(
        (e) => e.type === "event" && (DIRECTORY_EVENTS as readonly string[]).includes(e.name),
      );
      for (let from = fromBlock; from <= head; from += chunk) {
        const to = from + chunk - 1n > head ? head : from + chunk - 1n;
        const batch = await client.getLogs({ address, events: events as never, fromBlock: from, toBlock: to });
        for (const l of batch as unknown as Array<{
          eventName: DirectoryLog["eventName"];
          args: Record<string, unknown>;
          blockNumber: bigint;
          logIndex: number;
        }>) {
          logs.push({ eventName: l.eventName, args: l.args, blockNumber: l.blockNumber, logIndex: l.logIndex });
        }
      }
      return replayOrgEvents(logs);
    },
  };
}
