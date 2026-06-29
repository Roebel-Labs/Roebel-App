import "server-only";
/**
 * GK Safe server-side helpers — protocol-kit operations isolated to Node.
 *
 * All @safe-global/protocol-kit usage lives here; NO client component may
 * import from this module. The client only calls the route endpoints.
 *
 * Provider mode: Safe.init uses an RPC URL string (no wallet/signer) because
 * the server only builds, hashes, and encodes — it never holds a private key.
 * Signing is always done by the browser (thirdweb account.signMessage).
 */
import Safe, {
  buildSignatureBytes,
  buildContractSignature,
  EthSafeSignature,
} from "@safe-global/protocol-kit";
import { encodeFunctionData, getAddress } from "viem";
import { getApiKit } from "./api-kit";
import { GK_SAFE, SAFE_ABI } from "./constants";
import { gnosisClient } from "@/lib/muenzen/gnosis";

const ZERO = "0x0000000000000000000000000000000000000000";

/**
 * Safe "approved hash" (pre-validated) signature for an owner who approved the
 * tx hash on-chain via approveHash(): r = owner left-padded to 32 bytes, s = 0,
 * v = 1. buildSignatureBytes appends it verbatim in sorted position.
 */
function preValidatedSignature(owner: string): EthSafeSignature {
  const r = owner.toLowerCase().replace("0x", "").padStart(64, "0");
  return new EthSafeSignature(getAddress(owner), "0x" + r + "0".repeat(64) + "01");
}

function rpcUrl(): string {
  return process.env.GNOSIS_RPC_URL ?? "https://rpc.gnosischain.com";
}

/** Shared Safe.init in provider-only (RPC) mode. */
async function initSafe(): Promise<Safe> {
  return Safe.init({ provider: rpcUrl(), safeAddress: GK_SAFE });
}

// ---------------------------------------------------------------------------
// prepareSafeTx
// ---------------------------------------------------------------------------

/**
 * Creates a Safe transaction for the given MetaTransactionData and returns
 * its typed-data hash plus the raw transaction data needed for propose.
 */
export async function prepareSafeTx(metaTx: {
  to: string;
  value: string;
  data: string;
}): Promise<{ safeTxHash: string; safeTransactionData: Record<string, unknown> }> {
  const safe = await initSafe();
  const safeTx = await safe.createTransaction({ transactions: [metaTx] });
  const safeTxHash = await safe.getTransactionHash(safeTx);
  return { safeTxHash, safeTransactionData: safeTx.data as unknown as Record<string, unknown> };
}

// ---------------------------------------------------------------------------
// assembleSenderSignature
// ---------------------------------------------------------------------------

/**
 * Wraps the raw inner signature (from the browser) into the appropriate
 * Safe signature envelope:
 *   - isSmart → ERC-1271 contract-signature envelope (buildContractSignature, async in v8)
 *   - EOA     → plain EthSafeSignature bytes
 *
 * IMPORTANT: buildContractSignature is ASYNC in Protocol Kit v8 — always awaited.
 */
export async function assembleSenderSignature({
  inner,
  ownerAddress,
  isSmart,
}: {
  inner: string;
  ownerAddress: string;
  isSmart: boolean;
}): Promise<string> {
  if (isSmart) {
    // `inner` is the smart account's raw ECDSA signature, validated by its own
    // ERC-1271 isValidSignature — it is NOT itself a contract signature. Marking
    // the inner EthSafeSignature isContractSignature=true double-wrapped it
    // (259 bytes of nested owner/offset/length) so the Safe Transaction Service
    // rejected it as "... is not valid". Plain inner → correct 162-byte layout.
    const contractSig = await buildContractSignature(
      [new EthSafeSignature(ownerAddress, inner)],
      ownerAddress,
    );
    return buildSignatureBytes([contractSig]);
  }
  return buildSignatureBytes([new EthSafeSignature(ownerAddress, inner)]);
}

// ---------------------------------------------------------------------------
// encodeExecution
// ---------------------------------------------------------------------------

/**
 * Fetches the fully-confirmed Safe tx from the Safe Transaction Service,
 * reassembles it (with all stored signatures), and returns the ABI-encoded
 * execTransaction calldata + the Safe address to send it to.
 *
 * The caller sends this via thirdweb (gasless ERC-4337) so execution goes
 * through the smart-account relay, not the viem provider embedded in Protocol Kit.
 */
export async function encodeExecution(
  safeTxHash: string,
): Promise<{ to: string; data: string }> {
  const raw = await getApiKit().getTransaction(safeTxHash);

  // Collect signatures from two sources:
  //  1. Off-chain confirmations stored in the Safe Transaction Service (EOA owners).
  //  2. On-chain approvals via approveHash (smart-account owners) — these never
  //     appear in the service, so we read Safe.approvedHashes and synthesise a
  //     pre-validated signature for each approver.
  const sigs: EthSafeSignature[] = [];
  const signed = new Set<string>();
  for (const c of raw.confirmations ?? []) {
    sigs.push(
      new EthSafeSignature(
        c.owner,
        c.signature,
        c.signatureType === "CONTRACT_SIGNATURE",
      ),
    );
    signed.add(c.owner.toLowerCase());
  }

  try {
    const owners = [
      ...(await gnosisClient.readContract({
        address: getAddress(GK_SAFE),
        abi: SAFE_ABI,
        functionName: "getOwners",
      })),
    ] as string[];
    await Promise.all(
      owners.map(async (o) => {
        if (signed.has(o.toLowerCase())) return;
        const approved = (await gnosisClient.readContract({
          address: getAddress(GK_SAFE),
          abi: SAFE_ABI,
          functionName: "approvedHashes",
          args: [getAddress(o), safeTxHash as `0x${string}`],
        })) as bigint;
        if (approved > 0n) {
          sigs.push(preValidatedSignature(o));
          signed.add(o.toLowerCase());
        }
      }),
    );
  } catch {
    /* if the RPC reads fail, fall back to the service confirmations only */
  }

  // buildSignatureBytes sorts ascending by signer and concatenates — required by
  // Safe.checkNSignatures.
  const signatures = buildSignatureBytes(sigs);

  const data = encodeFunctionData({
    abi: SAFE_ABI,
    functionName: "execTransaction",
    args: [
      getAddress(raw.to),
      BigInt(raw.value),
      (raw.data ?? "0x") as `0x${string}`,
      Number(raw.operation),
      BigInt(raw.safeTxGas),
      BigInt(raw.baseGas),
      BigInt(raw.gasPrice),
      getAddress(raw.gasToken),
      getAddress(raw.refundReceiver ?? ZERO),
      signatures as `0x${string}`,
    ],
  });
  return { to: GK_SAFE, data };
}
