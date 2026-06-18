// Trust ("invite") a wallet so it can register as a Circles human and join Röbel-Taler.
//
// Circles invitation = the inviter calls Hub.trust(trustee, farExpiry). The trustee
// then completes registration by calling Hub.registerHuman(inviter) — in the Röbel app
// that is the "Bei Röbel-Taler mitmachen" button. On that registerHuman call the Hub
// BURNS 96 of the INVITER's OWN personal CRC and MINTS a 48 CRC welcome bonus to the
// trustee (verified on-chain: src/hub/Hub.sol, INVITATION_COST = 2 * WELCOME_BONUS).
//
// ⚠️ This script signs as a KEY-BASED inviter (INVITER_PRIVKEY, or SPIKE_PRIVKEY from
//    scripts/circles/.env). It CANNOT use a passkey wallet (e.g. a Metri account such
//    as 0x1f14…) — passkeys sign in-browser via WebAuthn only, there is no private key
//    a Node script can load. To invite from a passkey wallet, use WalletConnect in a
//    browser instead.
// ⚠️ The inviter MUST be a registered Circles human holding >= 96 of its OWN personal
//    CRC, otherwise the trustee's later registerHuman reverts on the 96-CRC burn.
//
//   TRUSTEE=0x<thirdweb Gnosis address> pnpm exec tsx scripts/circles/trust-wallet.ts
//   (optionally INVITER_PRIVKEY=0x… to override the .env SPIKE_PRIVKEY inviter)
import {
  createPublicClient,
  createWalletClient,
  http,
  getAddress,
  parseEther,
  formatEther,
} from "viem";
import { gnosis } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { loadEnv } from "./_env";

const HUB = getAddress("0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8");
const FAR_EXPIRY = 4102444800n; // ~year 2100 (uint96) — non-expiring trust
const INVITATION_COST = parseEther("96"); // 2 * WELCOME_BONUS(48), burned from the inviter

const hubAbi = [
  { type: "function", name: "trust", stateMutability: "nonpayable", inputs: [{ name: "_trustReceiver", type: "address" }, { name: "_expiry", type: "uint96" }], outputs: [] },
  { type: "function", name: "isHuman", stateMutability: "view", inputs: [{ name: "_h", type: "address" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "isTrusted", stateMutability: "view", inputs: [{ name: "_truster", type: "address" }, { name: "_trustee", type: "address" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "_account", type: "address" }, { name: "_id", type: "uint256" }], outputs: [{ type: "uint256" }] },
] as const;

async function main() {
  const trusteeRaw = process.env.TRUSTEE ?? process.argv[2];
  if (!trusteeRaw) throw new Error("Set TRUSTEE=0x<thirdweb Gnosis address> (the wallet to verify)");
  const trustee = getAddress(trusteeRaw);

  const { privKey, rpc } = loadEnv();
  const rawInv = process.env.INVITER_PRIVKEY ?? privKey;
  const invKey = (rawInv.startsWith("0x") ? rawInv : `0x${rawInv}`) as `0x${string}`;
  const inviter = privateKeyToAccount(invKey);

  const pub = createPublicClient({ chain: gnosis, transport: http(rpc) });
  const wallet = createWalletClient({ account: inviter, chain: gnosis, transport: http(rpc) });

  console.log("Inviter :", inviter.address);
  console.log("Trustee :", trustee, "(wallet to verify)");

  // 1) Inviter must itself be a registered Circles human.
  const inviterHuman = await pub.readContract({ address: HUB, abi: hubAbi, functionName: "isHuman", args: [inviter.address] });
  if (!inviterHuman) throw new Error("Inviter is NOT a registered Circles human — it cannot invite. Supply a human inviter key.");

  // 2) Inviter needs >= 96 of its OWN personal CRC (burned on the trustee's registerHuman).
  const personalId = BigInt(inviter.address);
  const personalCrc = await pub.readContract({ address: HUB, abi: hubAbi, functionName: "balanceOf", args: [inviter.address, personalId] });
  console.log(`Inviter personal CRC: ${formatEther(personalCrc)} (need >= 96)`);
  if (personalCrc < INVITATION_COST) {
    console.warn("⚠️  Inviter has < 96 personal CRC. trust() will succeed, but the trustee's\n    registerHuman will REVERT on the 96-CRC burn until the inviter accrues enough\n    (~1 CRC/hour). Use a better-funded human inviter, or wait.");
  }

  // 3) Idempotency.
  if (await pub.readContract({ address: HUB, abi: hubAbi, functionName: "isHuman", args: [trustee] })) {
    console.log("✓ Trustee is already a registered Circles human — nothing to do.");
    return;
  }
  if (await pub.readContract({ address: HUB, abi: hubAbi, functionName: "isTrusted", args: [inviter.address, trustee] })) {
    console.log("✓ Inviter already trusts the trustee (invitation already sent). Next: register in-app.");
    return;
  }

  // 4) trust() = the invitation.
  console.log("Sending trust() …");
  const hash = await wallet.writeContract({ address: HUB, abi: hubAbi, functionName: "trust", args: [trustee, FAR_EXPIRY] });
  console.log("  tx:", hash);
  await pub.waitForTransactionReceipt({ hash });

  const ok = await pub.readContract({ address: HUB, abi: hubAbi, functionName: "isTrusted", args: [inviter.address, trustee] });
  console.log(ok ? "✓ Invitation sent (inviter now trusts the trustee)." : "✗ Trust not reflected — check the tx.");
  console.log("\nNEXT: in the Röbel app, signed in as the thirdweb (trustee) account, tap");
  console.log('  “Bei Röbel-Taler mitmachen”. That calls registerHuman(inviter) →');
  console.log("  burns 96 CRC from the inviter, mints 48 CRC to the trustee. Verified ✓");
}

main().catch((e) => { console.error("TRUST FAILED:", e?.shortMessage ?? e?.message ?? e); process.exit(1); });
