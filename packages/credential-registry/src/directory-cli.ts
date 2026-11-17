#!/usr/bin/env tsx
/**
 * netizen-credential-register — rebuild the credential register from logs alone.
 *
 *   netizen-credential-register --registry 0x… --from-block 48500000 [--rpc https://…]
 *
 * Prints every type with its holder count (live holdings are those whose
 * validity, batch and leaf still count; org liveness is not re-checked here).
 */
import { parseArgs } from "node:util";
import { createPublicClient, http, type PublicClient } from "viem";
import { gnosis } from "viem/chains";
import { createCredentialRegistryReader } from "./reader";
import { isHoldingLive } from "./replay";

const { values } = parseArgs({
  options: {
    registry: { type: "string" },
    "from-block": { type: "string" },
    rpc: { type: "string", default: process.env.GNOSIS_RPC_URL ?? "https://rpc.gnosischain.com" },
  },
});
if (!values.registry || !values["from-block"]) {
  console.error("usage: netizen-credential-register --registry <address> --from-block <n> [--rpc <url>]");
  process.exit(2);
}

const client = createPublicClient({ chain: gnosis, transport: http(values.rpc) }) as PublicClient;
const reader = createCredentialRegistryReader({ client, address: values.registry as `0x${string}` });
const state = await reader.loadRegister(BigInt(values["from-block"]), { chunk: 10_000n });
const nowSec = BigInt(Math.floor(Date.now() / 1000));

const out = [...state.types.values()].map((t) => {
  const held = [...state.holdings.values()].filter((h) => h.typeId === t.typeId);
  return {
    typeId: t.typeId,
    orgId: t.orgId,
    kind: t.kind,
    policy: t.policy,
    recognised: t.recognised,
    retired: t.retired,
    metadataURI: t.config.metadataURI,
    holdings: held.length,
    liveHolders: held.filter((h) => isHoldingLive(state, h, { nowSec, orgAlive: () => true })).length,
  };
});
process.stdout.write(JSON.stringify(out, null, 2) + "\n");
