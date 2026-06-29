"use client";
/**
 * GK Safe client helpers — build meta-transactions and orchestrate propose/confirm/execute
 * via server-side API routes (NO @safe-global imports in this file).
 *
 * All protocol-kit crypto runs server-side in safe-server.ts.
 * The client keeps only:
 *   - thirdweb wallet interaction (signMessage, sendTransaction)
 *   - viem calldata encoding (buildTransfer, buildAddOwner, etc.)
 *   - signer resolution via on-chain getOwners() read
 */
import {
  sendTransaction,
  waitForReceipt,
  prepareTransaction,
  getContract,
  readContract,
} from "thirdweb";
import { getRpcClient, eth_getCode } from "thirdweb/rpc";
import { encodeFunctionData } from "viem";
import { client } from "@/app/client";
import { activeChain } from "@/lib/chains";
import { GK_SAFE, TOKENS, SAFE_ABI, type AssetId } from "./constants";
import { matchOwner, prevOwner } from "./owners";
import type { Account, Wallet } from "thirdweb/wallets";

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

async function postJson<T = unknown>(
  path: string,
  body: unknown,
): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data as T;
}

// ---------------------------------------------------------------------------
// Signer resolution (no protocol-kit — reads owners via thirdweb readContract)
// ---------------------------------------------------------------------------

/**
 * Checks whether the connected thirdweb account (or its admin EOA) is an
 * owner of the Safe. Returns the owner address (checksummed), a flag
 * indicating whether it is a smart-account owner (ERC-1271 required), and
 * the correct Account object to sign with.
 *
 * CRITICAL: when the matched owner is the admin EOA (not the smart account),
 * signing MUST be done with adminAccount — using the smart account for an
 * EOA-owner slot produces a wrong-key signature that the Safe will reject.
 */
export async function resolveSigner(
  account: Account,
  wallet?: Wallet,
): Promise<{ ownerAddress: string; isSmart: boolean; signingAccount: Account } | null> {
  // Fetch owners directly via thirdweb readContract (avoids protocol-kit).
  const safe = getContract({ client, chain: activeChain, address: GK_SAFE });
  const owners = [...(await readContract({
    contract: safe,
    method: "function getOwners() view returns (address[])",
    params: [],
  }))] as string[];

  // getAdminAccount() can return the Account SYNCHRONOUSLY (not a Promise), so
  // calling .catch() on its result throws "catch is not a function" — the exception
  // that was failing the owner check and every signature. `await` handles sync and
  // async returns; try/catch covers a throw or a missing method. wallet is optional;
  // a smart-account owner signs with `account` directly (no admin EOA needed).
  let adminAccount: Account | undefined;
  try {
    adminAccount = wallet
      ? ((await (wallet as any).getAdminAccount?.()) as Account | undefined)
      : undefined;
  } catch {
    adminAccount = undefined;
  }

  const ownerAddress = matchOwner(
    [account.address, adminAccount?.address],
    owners,
  );
  if (!ownerAddress) return null;

  // isSmart = ownerAddress has on-chain bytecode → smart-contract account (ERC-1271 path).
  // EOAs always return "0x"; contracts return non-empty bytecode.
  const rpcRequest = getRpcClient({ client, chain: activeChain });
  const code = await eth_getCode(rpcRequest, { address: ownerAddress as `0x${string}` });
  const isSmart = code != null && code !== "0x";

  // signingAccount: smart-account path uses the thirdweb smart account; EOA path uses
  // the admin EOA so the private key actually matches the registered Safe owner address.
  if (!isSmart && !adminAccount) return null;
  return {
    ownerAddress,
    isSmart,
    signingAccount: isSmart ? account : adminAccount!,
  };
}

// ---------------------------------------------------------------------------
// Transaction builders — transfers
// ---------------------------------------------------------------------------

const ERC20_TRANSFER_ABI = [
  {
    name: "transfer",
    type: "function" as const,
    stateMutability: "nonpayable" as const,
    inputs: [
      { name: "to", type: "address" as const },
      { name: "value", type: "uint256" as const },
    ],
    outputs: [{ type: "bool" as const }],
  },
] as const;

const ERC1155_TRANSFER_ABI = [
  {
    name: "safeTransferFrom",
    type: "function" as const,
    stateMutability: "nonpayable" as const,
    inputs: [
      { name: "from", type: "address" as const },
      { name: "to", type: "address" as const },
      { name: "id", type: "uint256" as const },
      { name: "amount", type: "uint256" as const },
      { name: "data", type: "bytes" as const },
    ],
    outputs: [],
  },
] as const;

/**
 * Builds a Safe MetaTransactionData for a token/native transfer.
 * - xdai: native value transfer
 * - eure: ERC-20 transfer(to, amount)
 * - muenzen: ERC-1155 safeTransferFrom(safe, to, id, amount, "0x")
 */
export function buildTransfer({
  asset,
  to,
  amountWei,
}: {
  asset: AssetId;
  to: string;
  amountWei: bigint;
}): { to: string; value: string; data: string } {
  if (asset === "xdai") {
    return { to, value: amountWei.toString(), data: "0x" };
  }

  const tok = TOKENS.find((t) => t.id === asset)!;

  if (asset === "eure") {
    return {
      to: tok.address!,
      value: "0",
      data: encodeFunctionData({
        abi: ERC20_TRANSFER_ABI,
        functionName: "transfer",
        args: [to as `0x${string}`, amountWei],
      }),
    };
  }

  // Röbel-Münzen: ERC-1155 group token — safeTransferFrom(safe, to, tokenId, amount, "0x")
  // The token address doubles as the ERC-1155 token id per Circles v2 convention.
  return {
    to: tok.address!,
    value: "0",
    data: encodeFunctionData({
      abi: ERC1155_TRANSFER_ABI,
      functionName: "safeTransferFrom",
      args: [
        GK_SAFE as `0x${string}`,
        to as `0x${string}`,
        BigInt(tok.address!),
        amountWei,
        "0x",
      ],
    }),
  };
}

// ---------------------------------------------------------------------------
// Transaction builders — owner management
// ---------------------------------------------------------------------------

/**
 * Builds a Safe MetaTransactionData to add a new owner and set the threshold.
 */
export function buildAddOwner(
  newOwner: string,
  threshold: number,
): { to: string; value: string; data: string } {
  return {
    to: GK_SAFE,
    value: "0",
    data: encodeFunctionData({
      abi: SAFE_ABI,
      functionName: "addOwnerWithThreshold",
      args: [newOwner as `0x${string}`, BigInt(threshold)],
    }),
  };
}

/**
 * Builds a Safe MetaTransactionData to remove an owner and update the threshold.
 * `owners` must be the array returned by Safe.getOwners() (linked-list order).
 */
export function buildRemoveOwner(
  owners: string[],
  owner: string,
  threshold: number,
): { to: string; value: string; data: string } {
  const prev = prevOwner(owners, owner);
  return {
    to: GK_SAFE,
    value: "0",
    data: encodeFunctionData({
      abi: SAFE_ABI,
      functionName: "removeOwner",
      args: [
        prev as `0x${string}`,
        owner as `0x${string}`,
        BigInt(threshold),
      ],
    }),
  };
}

/**
 * Builds a Safe MetaTransactionData to change the confirmation threshold.
 */
export function buildChangeThreshold(
  threshold: number,
): { to: string; value: string; data: string } {
  return {
    to: GK_SAFE,
    value: "0",
    data: encodeFunctionData({
      abi: SAFE_ABI,
      functionName: "changeThreshold",
      args: [BigInt(threshold)],
    }),
  };
}

// ---------------------------------------------------------------------------
// Client-side propose / confirm / execute — delegate crypto to server routes
// ---------------------------------------------------------------------------

/**
 * Proposes a new Safe MetaTransaction:
 * 1. Resolve the signer (owner check via on-chain read).
 * 2. POST /prepare to create the tx + get safeTxHash server-side.
 * 3. Sign safeTxHash with signingAccount.
 * 4. POST /propose with the raw inner signature (server assembles the envelope).
 */
export async function proposeMetaTx({
  metaTx,
  account,
  wallet,
}: {
  metaTx: { to: string; value: string; data: string };
  account: Account;
  wallet?: Wallet;
}): Promise<{ safeTxHash: string }> {
  const signer = await resolveSigner(account, wallet);
  if (!signer) throw new Error("Du bist kein Mitsignierer dieser Kasse.");

  const { safeTxHash, safeTransactionData } = await postJson<{
    safeTxHash: string;
    safeTransactionData: unknown;
  }>("/api/gemeinschaftskasse/prepare", { metaTx });

  const inner = await signer.signingAccount.signMessage({
    message: { raw: safeTxHash as `0x${string}` },
  });

  await postJson("/api/gemeinschaftskasse/propose", {
    safeTransactionData,
    safeTxHash,
    inner,
    ownerAddress: signer.ownerAddress,
    isSmart: signer.isSmart,
  });

  return { safeTxHash };
}

/**
 * Records an on-chain approval of a Safe tx hash from a smart-account owner via
 * Safe.approveHash(). Used instead of an off-chain ERC-1271 signature: thirdweb
 * smart wallets sign in a format this Safe version rejects ("... is not valid"),
 * so on-chain approval is the robust, format-free path for a contract owner.
 * Gasless — paid from the smart account via the thirdweb bundler.
 */
export async function approveHashOnChain({
  safeTxHash,
  account,
}: {
  safeTxHash: string;
  account: Account;
}): Promise<string> {
  const transaction = prepareTransaction({
    to: GK_SAFE as `0x${string}`,
    data: encodeFunctionData({
      abi: SAFE_ABI,
      functionName: "approveHash",
      args: [safeTxHash as `0x${string}`],
    }),
    value: 0n,
    chain: activeChain,
    client,
  });
  const receipt = await sendTransaction({ account, transaction });
  await waitForReceipt({
    client,
    chain: activeChain,
    transactionHash: receipt.transactionHash,
  });
  return receipt.transactionHash;
}

/**
 * Approves a pending Safe tx for the connected owner.
 *  - Smart-account owner → on-chain approveHash (robust; no off-chain signature).
 *  - EOA owner           → off-chain ECDSA confirmation via the Safe service.
 */
export async function confirmTx({
  safeTxHash,
  account,
  wallet,
}: {
  safeTxHash: string;
  account: Account;
  wallet?: Wallet;
}): Promise<void> {
  const signer = await resolveSigner(account, wallet);
  if (!signer) throw new Error("Du bist kein Mitsignierer dieser Kasse.");

  if (signer.isSmart) {
    await approveHashOnChain({ safeTxHash, account: signer.signingAccount });
    return;
  }

  const inner = await signer.signingAccount.signMessage({
    message: { raw: safeTxHash as `0x${string}` },
  });

  await postJson("/api/gemeinschaftskasse/confirm", {
    safeTxHash,
    inner,
    ownerAddress: signer.ownerAddress,
    isSmart: signer.isSmart,
  });
}

/**
 * Executes a fully-confirmed Safe tx via thirdweb (gasless ERC-4337 path).
 * The server encodes execTransaction calldata; the client dispatches it.
 */
export async function executeTx({
  safeTxHash,
  account,
}: {
  safeTxHash: string;
  account: Account;
}): Promise<string> {
  const { to, data } = await postJson<{ to: string; data: string }>(
    "/api/gemeinschaftskasse/execute-encode",
    { safeTxHash },
  );

  const transaction = prepareTransaction({
    to: to as `0x${string}`,
    data: data as `0x${string}`,
    value: 0n,
    chain: activeChain,
    client,
  });

  const receipt = await sendTransaction({ account, transaction });
  await waitForReceipt({
    client,
    chain: activeChain,
    transactionHash: receipt.transactionHash,
  });
  return receipt.transactionHash;
}
