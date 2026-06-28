"use client";
/**
 * GK Safe client helpers — build, sign, and execute Safe multisig transactions
 * via Protocol Kit v8 bridged through the thirdweb EIP-1193 provider (gasless).
 *
 * IMPORTANT: signing + execution require a connected thirdweb wallet and are
 * exercised in the browser only. The Node verification scripts cover the pure
 * calldata-encoding helpers.
 *
 * Execution path chosen: protocolKit.getEncodedTransaction(safeTx) → thirdweb
 * sendTransaction (gasless ERC-4337). NOT protocolKit.executeTransaction because
 * that routes through the viem provider embedded in Protocol Kit and bypasses the
 * thirdweb smart-account relay.
 */
import Safe, {
  buildSignatureBytes,
  buildContractSignature,
  EthSafeSignature,
  EthSafeTransaction,
} from "@safe-global/protocol-kit";
import { EIP1193 } from "thirdweb/wallets";
import {
  sendTransaction,
  waitForReceipt,
  prepareTransaction,
} from "thirdweb";
import { getRpcClient, eth_getCode } from "thirdweb/rpc";
import { encodeFunctionData } from "viem";
import { client } from "@/app/client";
import { activeChain } from "@/lib/chains";
import { GK_SAFE, TOKENS, SAFE_ABI, type AssetId } from "./constants";
import { matchOwner, prevOwner } from "./owners";
import type { Account, Wallet } from "thirdweb/wallets";

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/**
 * Creates a Protocol Kit v8 Safe instance connected through the thirdweb
 * EIP-1193 provider. `signer` is deliberately omitted so the SDK operates
 * in provider-only mode (no private key inside Protocol Kit); all signing
 * is done externally via thirdweb account.signMessage.
 */
export async function initProtocolKit(wallet: Wallet): Promise<Safe> {
  const provider = EIP1193.toProvider({ wallet, chain: activeChain, client });
  return Safe.init({ provider, safeAddress: GK_SAFE });
}

// ---------------------------------------------------------------------------
// Signer resolution
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
  protocolKit: Safe,
  account: Account,
  wallet: Wallet,
): Promise<{ ownerAddress: string; isSmart: boolean; signingAccount: Account } | null> {
  const owners = await protocolKit.getOwners();
  // getAdminAccount is thirdweb v5 smart-wallet API; may not exist for EOA wallets.
  const adminAccount: Account | undefined = await (wallet as any).getAdminAccount?.().catch(
    () => undefined,
  );
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
// Transaction builders — owner management (Task 3.1)
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
// Sign
// ---------------------------------------------------------------------------

/**
 * Creates a Safe transaction for the given MetaTransactionData, computes the
 * safeTxHash, and produces an ERC-1271 (smart-account) or plain-signature
 * (EOA) over the hash using the thirdweb account.
 *
 * CRITICAL (Protocol Kit v8): buildContractSignature is ASYNC — must be awaited.
 *
 * Returns:
 *   safeTxHash      — the typed-data Safe transaction hash
 *   senderSignature — the encoded signature bytes to send to proposeTransaction
 *   safeTx          — the SafeTransaction object (needed for propose + execute)
 */
export async function signSafeTx(
  protocolKit: Safe,
  signer: { ownerAddress: string; isSmart: boolean; signingAccount: Account },
  metaTx: { to: string; value: string; data: string },
): Promise<{
  safeTxHash: string;
  senderSignature: string;
  safeTx: EthSafeTransaction;
}> {
  const safeTx = await protocolKit.createTransaction({
    transactions: [metaTx],
  });
  const safeTxHash = await protocolKit.getTransactionHash(safeTx);

  // Sign the raw hash bytes with the account that owns the Safe owner slot.
  // For smart-account owners this is the thirdweb smart account; for EOA owners
  // this is the admin EOA whose private key matches the registered owner address.
  const inner = await signer.signingAccount.signMessage({
    message: { raw: safeTxHash as `0x${string}` },
  });

  let senderSignature: string;
  if (signer.isSmart) {
    // ERC-1271 path: wrap inner signature in a contract signature envelope.
    // buildContractSignature is ASYNC in Protocol Kit v8.
    const contractSig = await buildContractSignature(
      [new EthSafeSignature(signer.ownerAddress, inner, true)],
      signer.ownerAddress,
    );
    senderSignature = buildSignatureBytes([contractSig]);
  } else {
    // EOA path: plain signature bytes (Safe adjusts v internally).
    senderSignature = buildSignatureBytes([
      new EthSafeSignature(signer.ownerAddress, inner),
    ]);
  }

  return { safeTxHash, senderSignature, safeTx: safeTx as EthSafeTransaction };
}

// ---------------------------------------------------------------------------
// Execute
// ---------------------------------------------------------------------------

/**
 * Executes a fully-confirmed Safe transaction by encoding `execTransaction`
 * calldata and sending via thirdweb (gasless smart-account path).
 *
 * Execution path: `protocolKit.getEncodedTransaction(safeTx)` returns the
 * ABI-encoded `execTransaction(...)` call; we then dispatch it via thirdweb
 * `sendTransaction` so the meta-tx goes through the gasless ERC-4337 stack.
 *
 * Note: `protocolKit.executeTransaction` routes through the viem-based
 * provider embedded in Protocol Kit and does NOT use the thirdweb smart-account
 * relay. We use `getEncodedTransaction` + manual dispatch instead.
 *
 * @param account     — The thirdweb Account that holds the execution key.
 * @param protocolKit — Initialised Safe instance (used for encoding).
 * @param safeTx      — The fully-signed SafeTransaction to execute.
 * @returns tx hash string
 */
export async function executeSafeTx(
  account: Account,
  protocolKit: Safe,
  safeTx: EthSafeTransaction,
): Promise<string> {
  const encodedData = await protocolKit.getEncodedTransaction(safeTx);

  const tx = prepareTransaction({
    to: GK_SAFE as `0x${string}`,
    data: encodedData as `0x${string}`,
    value: 0n,
    chain: activeChain,
    client,
  });

  const receipt = await sendTransaction({ account, transaction: tx });
  await waitForReceipt({
    client,
    chain: activeChain,
    transactionHash: receipt.transactionHash,
  });
  return receipt.transactionHash;
}

// ---------------------------------------------------------------------------
// Execute from service raw tx (Task 2.3)
// ---------------------------------------------------------------------------

/**
 * Raw transaction shape as returned by GET /api/gemeinschaftskasse/tx.
 * Mirrors the fields from SafeMultisigTransactionResponse needed for reassembly.
 */
export interface RawTxFromService {
  to: string;
  value: string;
  data: string;
  operation: number;
  safeTxGas: string;
  baseGas: string;
  gasPrice: string;
  gasToken: string;
  refundReceiver: string;
  nonce: number;
  confirmations: { owner: string; signature: string; signatureType: string }[];
  confirmationsRequired: number;
  isExecuted: boolean;
}

/**
 * Reassembles a fully-confirmed Safe transaction from the raw service response
 * and executes it via thirdweb (gasless smart-account path).
 *
 * Protocol Kit v8: SafeTransaction.addSignature(SafeSignature) where
 * SafeSignature is EthSafeSignature(signer, data, isContractSignature).
 * isContractSignature = (signatureType === "CONTRACT_SIGNATURE").
 *
 * @param protocolKit  - Initialised Safe instance
 * @param account      - thirdweb Account used for execution
 * @param raw          - Raw tx fields from the /tx route
 * @returns tx hash string
 */
export async function executeFromService(
  protocolKit: Safe,
  account: Account,
  raw: RawTxFromService,
): Promise<string> {
  const safeTx = await protocolKit.createTransaction({
    transactions: [
      {
        to: raw.to,
        value: raw.value,
        data: raw.data,
        operation: raw.operation as 0 | 1,
      },
    ],
    options: {
      nonce: Number(raw.nonce),
      safeTxGas: raw.safeTxGas,
      baseGas: raw.baseGas,
      gasPrice: raw.gasPrice,
      gasToken: raw.gasToken,
      refundReceiver: raw.refundReceiver,
    },
  });

  // Attach each stored confirmation signature.
  for (const c of raw.confirmations) {
    const isContract = c.signatureType === "CONTRACT_SIGNATURE";
    (safeTx as EthSafeTransaction).addSignature(
      new EthSafeSignature(c.owner, c.signature, isContract),
    );
  }

  return executeSafeTx(account, protocolKit, safeTx as EthSafeTransaction);
}
