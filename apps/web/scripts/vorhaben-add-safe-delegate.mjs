// One-time: registers the server's proposer key as a delegate of the Attester Safe in the
// Safe Transaction Service. A delegate can QUEUE transactions only — never sign or execute.
// Run by a Safe owner (Max) locally:
//   OWNER_PRIVKEY=0x… DELEGATE_ADDRESS=0x… SAFE_API_KEY=… node apps/web/scripts/vorhaben-add-safe-delegate.mjs
// The owner key is read from the env of this one command and never written to disk.
import SafeApiKit from "@safe-global/api-kit";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http } from "viem";
import { gnosis } from "viem/chains";

const SAFE = "0x3A08c86Efc5ff38CC35d850F1D4d564e497bFDEa";
const { OWNER_PRIVKEY, DELEGATE_ADDRESS, SAFE_API_KEY } = process.env;
if (!OWNER_PRIVKEY || !DELEGATE_ADDRESS || !SAFE_API_KEY) {
  console.error("OWNER_PRIVKEY, DELEGATE_ADDRESS and SAFE_API_KEY are required");
  process.exit(1);
}
const owner = privateKeyToAccount(OWNER_PRIVKEY.startsWith("0x") ? OWNER_PRIVKEY : `0x${OWNER_PRIVKEY}`);
const signer = createWalletClient({ account: owner, chain: gnosis, transport: http("https://rpc.gnosischain.com") });
const api = new SafeApiKit({ chainId: 100n, apiKey: SAFE_API_KEY });
await api.addSafeDelegate({ safeAddress: SAFE, delegateAddress: DELEGATE_ADDRESS, delegatorAddress: owner.address, label: "Röbel App Auszahlungen", signer });
console.log("delegates:", (await api.getSafeDelegates({ safeAddress: SAFE })).results.map((d) => d.delegate));
