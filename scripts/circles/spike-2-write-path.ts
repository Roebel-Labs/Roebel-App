// Spike 2 — validate the Circles WRITE path on real Gnosis.
// Registers the (disposable) burner as an ORGANISATION avatar: no invite needed,
// harmless, and it exercises the full runner → SDK → on-chain pipeline we depend
// on for the eventual group registration. Proves transactions actually land.
import { Sdk } from "@aboutcircles/sdk";
import { circlesConfig } from "@aboutcircles/sdk-core";
import { formatEther } from "viem";
import { makeRunner } from "./runner";
import { loadEnv } from "./_env";

async function main() {
  const { privKey, rpc } = loadEnv();
  const runner = makeRunner(privKey, rpc);
  await runner.init();
  const me = runner.address;
  const bal = await runner.publicClient.getBalance({ address: me });
  console.log("Burner:", me, "| xDAI:", formatEther(bal));
  if (bal === 0n) { console.error("✗ unfunded"); process.exit(2); }

  const sdk = new Sdk(circlesConfig[100], runner as any);

  // Is the burner already an avatar from a prior run? (idempotency)
  try {
    const existing = await sdk.getAvatar(me);
    console.log("Already an avatar:", (existing as any).avatarType ?? "unknown", "→ write path already proven.");
    console.log("SPIKE 2 RESULT: PASS (idempotent)");
    return;
  } catch {
    // not registered yet — proceed
  }

  console.log("Registering burner as an organisation avatar (write-path test)…");
  const org = await sdk.register.asOrganization({
    name: "Roebel Spike Org",
    description: "Throwaway write-path validation for the Röbeltaler spike.",
  });
  console.log("\n✓ ON-CHAIN WRITE SUCCEEDED");
  console.log("  org avatar address:", (org as any).address ?? me);
  console.log("SPIKE 2 RESULT: PASS");
}

main().catch((e) => { console.error("SPIKE 2 FAILED:", e?.shortMessage ?? e?.message ?? e); process.exit(1); });
