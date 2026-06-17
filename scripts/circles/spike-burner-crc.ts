// Check the burner's personal CRC (can it be the inviter/operator?). Personal CRC
// token id = uint256(avatarAddress). Mint accrued issuance, then read balance.
// ~96 CRC needed per invite.
import { createPublicClient, createWalletClient, http, formatEther } from "viem";
import { gnosis } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { loadEnv } from "./_env";

const HUB = "0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8";
const abi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }, { name: "id", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "personalMint", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "calculateIssuance", stateMutability: "view", inputs: [{ name: "h", type: "address" }], outputs: [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }] },
] as const;

async function main() {
  const { privKey, rpc } = loadEnv();
  const account = privateKeyToAccount(privKey);
  const id = BigInt(account.address);
  const pub = createPublicClient({ chain: gnosis, transport: http(rpc) });
  const wallet = createWalletClient({ account, chain: gnosis, transport: http(rpc) });
  console.log("Burner:", account.address);

  const before = await pub.readContract({ address: HUB, abi, functionName: "balanceOf", args: [account.address, id] });
  console.log("personal CRC before:", formatEther(before));
  try {
    const [issuance] = await pub.readContract({ address: HUB, abi, functionName: "calculateIssuance", args: [account.address] });
    console.log("claimable issuance:", formatEther(issuance));
  } catch (e: any) { console.log("calculateIssuance n/a:", e?.shortMessage ?? e?.message); }

  try {
    console.log("personalMint() …");
    const hash = await wallet.writeContract({ address: HUB, abi, functionName: "personalMint", args: [] });
    await pub.waitForTransactionReceipt({ hash });
    console.log("minted:", hash);
  } catch (e: any) { console.log("personalMint reverted:", e?.shortMessage ?? e?.message ?? e); }

  const after = await pub.readContract({ address: HUB, abi, functionName: "balanceOf", args: [account.address, id] });
  console.log("personal CRC after:", formatEther(after));
  const crc = Number(formatEther(after));
  console.log(`\n→ Can invite ~${Math.floor(crc / 96)} citizens now (96 CRC each). Onboarded citizens then accrue + invite more (cascade).`);
}

main().catch((e) => { console.error("FAILED:", e?.shortMessage ?? e?.message ?? e); process.exit(1); });
