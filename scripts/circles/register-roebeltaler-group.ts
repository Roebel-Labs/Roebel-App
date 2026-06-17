// Register the PERMANENT Röbeltaler Circles BaseGroup on Gnosis, gate it to the
// 15 CitizenNFT holders (owner-curated trust = the citizen gate), then hand the
// group to the 3-of-5 Attester Safe.
//
//   pnpm exec tsx scripts/circles/register-roebeltaler-group.ts
//
// Design (all confirmed in docs/superpowers/spikes/2026-06-17-roebeltaler-spikes.md):
//  - standard Base Mint Policy (factory default) → preserves inter-group fungibility
//  - feeCollection = Stadt-Safe (the Attester Safe for now), fee 0
//  - initialConditions = [] (membership is owner-curated; an automated CitizenNFT
//    condition can be added later via setMembershipCondition — conditions are mutable)
//  - owner = burner during setup so it can trust members + setOwner; ends as the Safe
import { Sdk } from "@aboutcircles/sdk";
import { circlesConfig } from "@aboutcircles/sdk-core";
import { createPublicClient, createWalletClient, http, getAddress } from "viem";
import { gnosis } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { makeRunner } from "./runner";
import { loadEnv } from "./_env";

const SAFE = getAddress("0x3A08c86Efc5ff38CC35d850F1D4d564e497bFDEa");
const CITIZENS = [
  "0xC49dE63CcfeE46C6C5c3E393293f66779799Fb28","0x90F677dC480e76a127Ec1dCE42263a370e396313",
  "0xf468d87FCa0E15bC2c383eF482D38b9b77812b29","0xCa598EcD6541177897c7a30cE378e53F5557e951",
  "0xD7cA07c0F152fC27F0E48d5326e07026e4fDD4bA","0x3B49287F15F5605036d135A296C2bAC2aFbFA24c",
  "0xEbf3C1694FBD80b1a7ab8F82e19A1291Cd795227","0x466587C1102a99726b2751712c69338cf0401f43",
  "0x5Ddf5ee5ac3b5DeB9eae2920E71997e2a07A406B","0xa6B3defbBe135f3fcE045e59b3e984c23d43E5a8",
  "0x1a3cD237400b032DCfB3d45Ef694674f2dEcdee0","0x2645530306321e4758FF93559A4F44a826C6EfA6",
  "0x1916bAC01118EE53A7F7eca0F312431b68011Ce4","0xd1A7d945fCCa08f67E30E526E34cf4Aaa2725D03",
  "0x0e9C37cfc94E1BAFCd53450998Cc26d10A6b5D20",
].map((a) => getAddress(a));

const FAR_EXPIRY = 4102444800n; // year 2100 (uint96)

const baseGroupAbi = [
  { type: "function", name: "trustBatchWithConditions", stateMutability: "nonpayable", inputs: [{ name: "_members", type: "address[]" }, { name: "_expiry", type: "uint96" }], outputs: [] },
  { type: "function", name: "setOwner", stateMutability: "nonpayable", inputs: [{ name: "_owner", type: "address" }], outputs: [] },
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;

async function main() {
  const { privKey, rpc } = loadEnv();
  const account = privateKeyToAccount(privKey);
  const runner = makeRunner(privKey, rpc);
  await runner.init();
  const pub = createPublicClient({ chain: gnosis, transport: http(rpc) });
  const wallet = createWalletClient({ account, chain: gnosis, transport: http(rpc) });
  console.log("Burner (interim owner):", account.address);

  const sdk = new Sdk(circlesConfig[100], runner as any);
  console.log("Registering Röbeltaler BaseGroup (standard policy, fee 0)…");
  const group: any = await sdk.register.asGroup(
    account.address,   // owner (interim → Safe)
    account.address,   // service
    SAFE,              // feeCollection (Stadt-Safe placeholder), fee 0
    [],                // initialConditions (owner-curated; add CitizenNFT condition later)
    "Roebeltaler",     // name (≤19)
    "RTLR",            // symbol
    { name: "Röbeltaler", description: "Bürger-gestützte Gemeinschaftswährung für Röbel/Müritz." },
  );
  const groupAddr = getAddress(group.address ?? group);
  console.log("✓ group:", groupAddr);

  console.log(`Trusting ${CITIZENS.length} citizens (the citizen gate)…`);
  const h1 = await wallet.writeContract({ address: groupAddr, abi: baseGroupAbi, functionName: "trustBatchWithConditions", args: [CITIZENS, FAR_EXPIRY] });
  await pub.waitForTransactionReceipt({ hash: h1 });
  console.log("  trusted (tx", h1, ")");

  console.log("Handing ownership to the Attester Safe…");
  const h2 = await wallet.writeContract({ address: groupAddr, abi: baseGroupAbi, functionName: "setOwner", args: [SAFE] });
  await pub.waitForTransactionReceipt({ hash: h2 });
  const owner = await pub.readContract({ address: groupAddr, abi: baseGroupAbi, functionName: "owner" });
  console.log("  owner now:", owner, getAddress(owner) === SAFE ? "= Safe ✓" : "✗");

  console.log("\n=== DONE ===");
  console.log("Röbeltaler group:", groupAddr);
  console.log("Set EXPO_PUBLIC_ROEBELTALER_GROUP =", groupAddr);
}

main().catch((e) => { console.error("REGISTER FAILED:", e?.shortMessage ?? e?.message ?? e); process.exit(1); });
