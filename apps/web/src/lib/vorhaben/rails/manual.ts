// manual_safe rail: never sends. An Attester records the hash of a transfer the Safe owners executed
// themselves; the server checks it on-chain before the line moves on.
import { createPublicClient, http, parseAbi, parseEventLogs } from "viem";
import { gnosis } from "viem/chains";
import { ATTESTER_SAFE, EURE } from "../constants";
import { toAtto } from "../money";

const transferAbi = parseAbi(["event Transfer(address indexed from, address indexed to, uint256 value)"]);

/** True when the tx succeeded and contains an EURe Transfer from the Attester Safe for exactly `amount`. */
export async function verifyManualSafeTransfer(txHash: string, amount: string): Promise<boolean> {
  const pub = createPublicClient({ chain: gnosis, transport: http(process.env.GNOSIS_RPC_URL ?? "https://rpc.gnosischain.com", { batch: false }) });
  const r = await pub.getTransactionReceipt({ hash: txHash as `0x${string}` }).catch(() => null);
  if (!r || r.status !== "success") return false;
  const logs = parseEventLogs({ abi: transferAbi, logs: r.logs.filter((l) => l.address.toLowerCase() === EURE.toLowerCase()) });
  const want = toAtto(amount);
  return logs.some((l) => l.args.from.toLowerCase() === ATTESTER_SAFE.toLowerCase() && l.args.value === want);
}
