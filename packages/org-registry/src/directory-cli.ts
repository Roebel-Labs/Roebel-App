#!/usr/bin/env tsx
/**
 * netizen-org-directory — rebuild the org directory from OrgRegistry logs alone.
 *
 *   netizen-org-directory --registry 0x… --from-block 48452410 [--rpc https://…]
 *
 * No database, no API: this is the check that anyone can reproduce the org
 * directory from the chain. Prints JSON to stdout.
 */
import { parseArgs } from "node:util";
import { createPublicClient, http, type PublicClient } from "viem";
import { gnosis } from "viem/chains";
import { createOrgRegistryReader } from "./reader.js";

const { values } = parseArgs({
  options: {
    registry: { type: "string" },
    "from-block": { type: "string" },
    rpc: { type: "string", default: process.env.GNOSIS_RPC_URL ?? "https://rpc.gnosischain.com" },
  },
});
if (!values.registry || !values["from-block"]) {
  console.error("usage: netizen-org-directory --registry <address> --from-block <n> [--rpc <url>]");
  process.exit(2);
}

const client = createPublicClient({ chain: gnosis, transport: http(values.rpc) }) as PublicClient;
const reader = createOrgRegistryReader({ client, address: values.registry as `0x${string}` });
const dir = await reader.loadDirectory(BigInt(values["from-block"]), { chunk: 10_000n });

const out = [...dir.values()].map((o) => ({
  orgId: o.orgId,
  safe: o.safe,
  metadataURI: o.metadataURI,
  nostrKeys: [...o.nostrKeys],
  roles: Object.fromEntries(o.roles),
  registeredAtBlock: o.registeredAtBlock.toString(),
}));
process.stdout.write(JSON.stringify(out, null, 2) + "\n");
