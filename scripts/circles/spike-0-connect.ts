// Spike 0 — connectivity smoke test.
// Confirms: burner derives an address, is funded with xDAI, viem reaches Gnosis,
// and @aboutcircles/sdk + circlesConfig[100] load. No state-changing tx.
import { createPublicClient, http, formatEther } from "viem";
import { gnosis } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { loadEnv } from "./_env";

async function main() {
  const { privKey, rpc } = loadEnv();
  const account = privateKeyToAccount(privKey);
  console.log("Burner address:", account.address);

  const publicClient = createPublicClient({ chain: gnosis, transport: http(rpc) });
  const chainId = await publicClient.getChainId();
  console.log("Connected chainId:", chainId, chainId === 100 ? "(Gnosis ✓)" : "(NOT Gnosis ✗)");

  const balance = await publicClient.getBalance({ address: account.address });
  console.log("xDAI balance:", formatEther(balance), balance > 0n ? "✓ funded" : "✗ EMPTY — fund before tx spikes");

  // Confirm the SDK + config load and expose the Gnosis contract set.
  const sdkMod = await import("@aboutcircles/sdk");
  const coreMod: any = await import("@aboutcircles/sdk-core");
  const cfg = coreMod.circlesConfig?.[100];
  console.log("SDK exports:", Object.keys(sdkMod).slice(0, 12).join(", "));
  console.log("circlesConfig[100] present:", !!cfg);
  if (cfg) {
    console.log("  v2HubAddress:", cfg.v2HubAddress ?? cfg.hubAddress ?? "(key name differs — inspect)");
    console.log("  config keys:", Object.keys(cfg).join(", "));
  }
  console.log("\nSPIKE 0 RESULT:", balance > 0n && chainId === 100 ? "PASS" : "ATTENTION NEEDED");
}

main().catch((e) => { console.error("SPIKE 0 FAILED:", e); process.exit(1); });
