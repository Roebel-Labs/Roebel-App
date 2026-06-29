/**
 * EMERGENCY standalone withdrawal from the Gemeinschaftskasse Safe (Gnosis).
 * Independent of the web app, Vercel, and the Safe Transaction Service — your
 * worst-case "get the money out" lever.
 *
 * It uses the TWO Safe owners you control:
 *   - OWNER_EOA_KEY   : your MetaMask owner 0x1c11…  (signs the hash off-chain)
 *   - SMART_ADMIN_KEY : the admin key of smart-account owner 0xC49d… (0xD55b…),
 *                       which approves the hash ON-CHAIN via approveHash().
 *
 * The smart account never needs an off-chain ERC-1271 signature (that's the part
 * that was failing); it approves on-chain instead. Everything is gasless
 * (thirdweb-sponsored), so neither key needs xDAI.
 *
 * Flow: build transfer → compute safeTxHash on-chain → EOA signs it →
 *       smart owner approveHash() → SIMULATE execTransaction (read-only) →
 *       only if EXECUTE=1, actually send.
 *
 * Run from apps/web:
 *   OWNER_EOA_KEY=0x...  SMART_ADMIN_KEY=0x...  THIRDWEB_CLIENT_ID=<clientId> \
 *   TO=0xRecipient  ASSET=xdai  AMOUNT=1.5 \
 *   node scripts/gk-emergency-withdraw.mjs            # dry-run (simulate only)
 *
 *   ...same... EXECUTE=1  node scripts/gk-emergency-withdraw.mjs   # send for real
 *
 * ASSET = xdai | eure ; AMOUNT in human units. Keys are read from env only —
 * never hard-code them, never commit them.
 */
import {
  createPublicClient, http, encodeFunctionData, parseEther,
  getAddress, parseAbi, sign, serializeSignature,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { gnosis } from "viem/chains";
import {
  createThirdwebClient, getContract, prepareContractCall,
  sendTransaction as twSend, waitForReceipt as twWait,
} from "thirdweb";
import { privateKeyToAccount as twPrivateKeyToAccount } from "thirdweb/wallets";
import { smartWallet } from "thirdweb/wallets/smart";
import { gnosis as twGnosis } from "thirdweb/chains";

const SAFE = "0x3A08c86Efc5ff38CC35d850F1D4d564e497bFDEa";
const SMART_OWNER = "0xC49dE63CcfeE46C6C5c3E393293f66779799Fb28";
const EURE = "0xcB444e90D8198415266c6a2724b7900fb12FC56E";
const ZERO = "0x0000000000000000000000000000000000000000";
const RPC = process.env.GNOSIS_RPC_URL || "https://rpc.gnosischain.com";

const SAFE_ABI = parseAbi([
  "function nonce() view returns (uint256)",
  "function getTransactionHash(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 _nonce) view returns (bytes32)",
  "function approveHash(bytes32 hashToApprove)",
  "function execTransaction(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,bytes signatures) payable returns (bool)",
]);
const ERC20_ABI = parseAbi(["function transfer(address to,uint256 value) returns (bool)"]);

const need = (v, n) => { if (!v) throw new Error("Missing env: " + n); return v; };
const hex = (k) => (k.startsWith("0x") ? k : "0x" + k);

const ownerKey = hex(need(process.env.OWNER_EOA_KEY, "OWNER_EOA_KEY"));
const adminKey = hex(need(process.env.SMART_ADMIN_KEY, "SMART_ADMIN_KEY"));
const clientId = need(process.env.THIRDWEB_CLIENT_ID, "THIRDWEB_CLIENT_ID");
const to = getAddress(need(process.env.TO, "TO"));
const asset = (process.env.ASSET || "xdai").toLowerCase();
const amount = need(process.env.AMOUNT, "AMOUNT");
const doExecute = process.env.EXECUTE === "1";

const pub = createPublicClient({ chain: gnosis, transport: http(RPC) });
const ownerAccount = privateKeyToAccount(ownerKey);
console.log("EOA owner   :", ownerAccount.address);

// 1) Build the transfer
let txTo, txValue, txData;
if (asset === "xdai") { txTo = to; txValue = parseEther(amount); txData = "0x"; }
else if (asset === "eure") { txTo = EURE; txValue = 0n; txData = encodeFunctionData({ abi: ERC20_ABI, functionName: "transfer", args: [to, parseEther(amount)] }); }
else throw new Error("ASSET must be xdai or eure");

// 2) nonce + safeTxHash, computed by the Safe itself
const nonce = await pub.readContract({ address: SAFE, abi: SAFE_ABI, functionName: "nonce" });
const txArgs = [txTo, txValue, txData, 0, 0n, 0n, 0n, ZERO, ZERO, nonce];
const safeTxHash = await pub.readContract({ address: SAFE, abi: SAFE_ABI, functionName: "getTransactionHash", args: txArgs });
console.log("safeTxHash  :", safeTxHash, "(nonce " + nonce + ")");

// 3) EOA owner signs the raw hash (v=27/28 → Safe's direct ecrecover path)
const eoaSig = serializeSignature(await sign({ hash: safeTxHash, privateKey: ownerKey }));

// 4) Smart owner approves the hash ON-CHAIN (gasless)
const twClient = createThirdwebClient({ clientId });
const personal = twPrivateKeyToAccount({ client: twClient, privateKey: adminKey });
const smart = await smartWallet({ chain: twGnosis, sponsorGas: true }).connect({ client: twClient, personalAccount: personal });
console.log("Smart owner :", smart.address);
if (smart.address.toLowerCase() !== SMART_OWNER.toLowerCase())
  throw new Error("Reconstructed smart account != 0xC49d. Wrong admin key / factory — aborting.");
const safeContract = getContract({ client: twClient, chain: twGnosis, address: SAFE });
const ar = await twSend({ account: smart, transaction: prepareContractCall({ contract: safeContract, method: "function approveHash(bytes32)", params: [safeTxHash] }) });
await twWait({ client: twClient, chain: twGnosis, transactionHash: ar.transactionHash });
console.log("approveHash :", ar.transactionHash);

// 5) Assemble sorted signatures + SIMULATE execTransaction before sending
const preValidated = (o) => "0x" + o.toLowerCase().replace("0x", "").padStart(64, "0") + "0".repeat(64) + "01";
const parts = [
  { signer: ownerAccount.address, data: eoaSig },
  { signer: SMART_OWNER, data: preValidated(SMART_OWNER) },
].sort((a, b) => a.signer.toLowerCase().localeCompare(b.signer.toLowerCase()));
const signatures = "0x" + parts.map((p) => p.data.slice(2)).join("");
const execArgs = [txTo, txValue, txData, 0, 0n, 0n, 0n, ZERO, ZERO, signatures];

try {
  await pub.simulateContract({ address: SAFE, abi: SAFE_ABI, functionName: "execTransaction", args: execArgs, account: ownerAccount.address });
  console.log("SIMULATION  : OK — execTransaction would succeed.");
} catch (e) {
  console.log("SIMULATION  : FAILED —", e.shortMessage || e.message);
  process.exit(1);
}

if (!doExecute) { console.log("\nDry-run only. Re-run with EXECUTE=1 to send for real."); process.exit(0); }

// 6) Execute (gasless via the smart account)
const er = await twSend({ account: smart, transaction: prepareContractCall({ contract: safeContract, method: "function execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes) returns (bool)", params: execArgs }) });
await twWait({ client: twClient, chain: twGnosis, transactionHash: er.transactionHash });
console.log("EXECUTED    :", er.transactionHash);
console.log("Done — funds sent to", to);
