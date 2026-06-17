// Spike 1 — register a THROWAWAY Röbeltaler test group on Gnosis.
// Groups are permissionless (no invite needed), so this validates the centerpiece
// of the design: standing up a collateral-backed group currency.
//
// Optimistic defaults (to validate with the Circles team — spec §10.5):
//  - standard Base Mint Policy (initialConditions = [] for the OPEN test group;
//    production passes the CitizenNFT membership-condition address here)
//  - fee = 0; feeCollection = burner (placeholder Stadt-Safe)
//  - owner/service = burner (production: the 3-of-5 Attester Safe)
//
// REQUIRES the burner to hold xDAI for gas. Read-only until then.
import { Sdk } from "@aboutcircles/sdk";
import { circlesConfig } from "@aboutcircles/sdk-core";
import { formatEther } from "viem";
import { makeRunner } from "./runner";
import { loadEnv } from "./_env";

const NAME = "Roebeltaler Pilot"; // ≤19 chars; "ö" avoided in on-chain name
const SYMBOL = "RTLR"; // ASCII/base58-safe; display name stays "Röbeltaler"

async function main() {
  const { privKey, rpc } = loadEnv();
  const runner = makeRunner(privKey, rpc);
  await runner.init();
  const me = runner.address;
  console.log("Burner / owner:", me);

  const bal = await runner.publicClient.getBalance({ address: me });
  console.log("xDAI:", formatEther(bal));
  if (bal === 0n) {
    console.error("\n✗ BLOCKED: burner has 0 xDAI — fund it before registering the group.");
    process.exit(2);
  }

  const sdk = new Sdk(circlesConfig[100], runner as any);
  console.log("Registering test group:", NAME, `(${SYMBOL}) …`);

  const group = await sdk.register.asGroup(
    me, // owner       (prod: Attester Safe)
    me, // service     (prod: Attester Safe / service module)
    me, // feeCollection (prod: Stadt-Safe); fee rate 0 at pilot
    [], // initialConditions — OPEN test group (prod: [citizenNFTConditionAddress])
    NAME,
    SYMBOL,
    { name: "Röbeltaler", description: "Pilot community currency for Röbel/Müritz." },
  );

  console.log("\n✓ GROUP REGISTERED");
  console.log("  group address:", (group as any).address ?? group);
  console.log("\nSet EXPO_PUBLIC_ROEBELTALER_GROUP to this address for the app.");
}

main().catch((e) => { console.error("SPIKE 1 FAILED:", e); process.exit(1); });
