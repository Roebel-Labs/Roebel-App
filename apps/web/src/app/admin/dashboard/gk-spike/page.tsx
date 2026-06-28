"use client";
import { useState } from "react";
import { useActiveAccount, useActiveWallet } from "thirdweb/react";
import { readContract, getContract } from "thirdweb";
import { client } from "@/app/client";
import { activeChain } from "@/lib/chains";
import Safe, {
  buildSignatureBytes,
  buildContractSignature,
  EthSafeSignature,
} from "@safe-global/protocol-kit";
import { EIP1193 } from "thirdweb/wallets";
import { matchOwner } from "@/lib/gemeinschaftskasse/owners";

const SAFE = "0x3A08c86Efc5ff38CC35d850F1D4d564e497bFDEa";
const MAGIC = "0x1626ba7e"; // ERC-1271 isValidSignature(bytes32,bytes) success

export default function GkSpike() {
  const account = useActiveAccount();
  const wallet = useActiveWallet();
  const [log, setLog] = useState<string[]>([]);
  const add = (s: string) => setLog((l) => [...l, s]);

  async function run() {
    if (!account || !wallet) return add("❌ no wallet connected");
    try {
      const provider = EIP1193.toProvider({ wallet, chain: activeChain, client });
      const adminAccount = (await wallet.getAdminAccount?.()) ?? undefined;
      const protocolKit = await Safe.init({ provider, safeAddress: SAFE });
      const owners = await protocolKit.getOwners();
      add(`owners: ${owners.join(", ")}`);

      const ownerAddr = matchOwner([account.address, adminAccount?.address], owners);
      if (!ownerAddr)
        return add(
          `❌ connected account is NOT a Safe owner (smart=${account.address}, admin=${adminAccount?.address})`,
        );
      const isSmart = ownerAddr.toLowerCase() === account.address.toLowerCase();
      add(`✅ owner=${ownerAddr} kind=${isSmart ? "smart" : "eoa"}`);

      // Build a harmless sample tx (0 xDAI to the Safe itself) and hash it.
      const safeTx = await protocolKit.createTransaction({
        transactions: [{ to: SAFE, value: "0", data: "0x" }],
      });
      const txHash = await protocolKit.getTransactionHash(safeTx);
      add(`safeTxHash=${txHash}`);

      if (isSmart) {
        // Smart account signs the hash; assemble an ERC-1271 contract signature.
        const inner = await account.signMessage({ message: { raw: txHash as `0x${string}` } });
        // Verify the smart account itself accepts it (read-only).
        const smart = getContract({ client, chain: activeChain, address: account.address });
        const res = await readContract({
          contract: smart,
          method: "function isValidSignature(bytes32,bytes) view returns (bytes4)",
          params: [txHash as `0x${string}`, inner as `0x${string}`],
        });
        add(
          res.toLowerCase() === MAGIC
            ? "✅ smart account isValidSignature → MAGIC"
            : `❌ isValidSignature=${res}`,
        );
        const contractSig = await buildContractSignature(
          [new EthSafeSignature(ownerAddr, inner, true)],
          ownerAddr,
        );
        add(`assembled contract signature bytes len=${buildSignatureBytes([contractSig]).length}`);

        // Step 4: confirm the assembled signature is Safe-acceptable (read-only checkSignatures)
        const safeC = getContract({ client, chain: activeChain, address: SAFE });
        await readContract({
          contract: safeC,
          method: "function checkSignatures(bytes32 dataHash, bytes data, bytes signatures) view",
          params: [
            txHash as `0x${string}`,
            "0x",
            buildSignatureBytes([contractSig]) as `0x${string}`,
          ],
        });
        add("✅ Safe.checkSignatures accepted the assembled signature");
      } else {
        // EOA branch: sign with the admin EOA (whose address matches the Safe owner slot),
        // build a plain EthSafeSignature, then verify via Safe.checkSignatures.
        if (!adminAccount) {
          add("❌ EOA owner matched but adminAccount is undefined — cannot sign");
        } else {
          const eoaSig = await adminAccount.signMessage({ message: { raw: txHash as `0x${string}` } });
          add(`✅ admin EOA signed, sig len=${eoaSig.length}`);
          const plainSig = new EthSafeSignature(ownerAddr, eoaSig);
          const sigBytes = buildSignatureBytes([plainSig]) as `0x${string}`;
          // Verify Safe accepts this EOA signature (read-only checkSignatures).
          const safeC = getContract({ client, chain: activeChain, address: SAFE });
          await readContract({
            contract: safeC,
            method: "function checkSignatures(bytes32 dataHash, bytes data, bytes signatures) view",
            params: [txHash as `0x${string}`, "0x", sigBytes],
          });
          add("✅ Safe.checkSignatures accepted the EOA signature");
        }
      }
      add("DONE — signing path validated (no funds moved)");
    } catch (e) {
      add(`❌ ${(e as Error).message}`);
    }
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-lg font-medium">GK signing spike</h1>
      <button onClick={run} className="px-4 py-2 rounded bg-[#00498B] text-white">
        Test signature
      </button>
      <pre className="text-xs whitespace-pre-wrap bg-muted p-3 rounded">{log.join("\n")}</pre>
    </div>
  );
}
