// Spike 3 — mint personal CRC for the (already-registered) burner human.
// Validates the personalToken.mint() path that produces the collateral backing
// the Röbeltaler. Real on-chain tx.
import { Sdk } from "@aboutcircles/sdk";
import { circlesConfig } from "@aboutcircles/sdk-core";
import { makeRunner } from "./runner";
import { loadEnv } from "./_env";

async function main() {
  const { privKey, rpc } = loadEnv();
  const runner = makeRunner(privKey, rpc);
  await runner.init();
  const sdk = new Sdk(circlesConfig[100], runner as any);
  const avatar: any = await sdk.getAvatar(runner.address);
  console.log("Human avatar:", avatar.address);

  const before = await avatar.balances.getTokenBalances();
  console.log("balances before:", JSON.stringify(before));

  console.log("Calling personalToken.mint() …");
  const receipt = await avatar.personalToken.mint();
  console.log("mint tx:", receipt?.transactionHash ?? receipt?.hash ?? "(submitted)");

  const after = await avatar.balances.getTokenBalances();
  console.log("balances after:", JSON.stringify(after));
  console.log("SPIKE 3 RESULT: PASS");
}

main().catch((e) => { console.error("SPIKE 3 FAILED:", e?.shortMessage ?? e?.message ?? e); process.exit(1); });
