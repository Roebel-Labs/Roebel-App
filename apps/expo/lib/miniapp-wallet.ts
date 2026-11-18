/**
 * EIP-1193 helpers for the Mini App host wallet bridge.
 *
 * A mini app talks to an injected EIP-1193 provider (`wallet.request`). The host
 * (MiniAppHost) forwards each request here:
 *  - read-only / trivial methods (`eth_chainId`, `eth_accounts`, `eth_requestAccounts`)
 *    are answered directly; chain reads go through the host's RPC proxy (miniapp-rpc.ts);
 *  - signing methods (`eth_sendTransaction`, `personal_sign`, `eth_signTypedData*`)
 *    are decoded into a `WalletConfirmRequest` for the native confirm sheet, then
 *    executed against the thirdweb smart account only after the user approves.
 *
 * No blind signing (spec §4.2). Rejection surfaces `{ code: 'user_rejected' }`.
 */
import type { Account } from 'thirdweb/wallets';
import { prepareTransaction, sendTransaction } from 'thirdweb';
import { classifyWalletMethod } from '@netizen-labs/miniapp-sdk/host';
import { client } from '@/constants/thirdweb';
import { gnosis } from '@/constants/gnosis';
import type { WalletConfirmRequest } from '@/components/miniapp/WalletConfirmSheet';
import { PROXIED_METHODS, type RpcProxy } from '@/lib/miniapp-rpc';
import {
  buildMessageConfirm,
  buildTransactionConfirm,
  buildTypedDataConfirm,
  type ConfirmApp,
  type NameLookup,
} from '@/lib/miniapp-confirm';

// Mini apps operate on Gnosis — Röbel-Münzen (Circles v2), identity, and
// governance all live on Gnosis (chainId 100). The active thirdweb smart
// account signs there (same pattern as the verification/voting flows).
const chain = gnosis;

/** Host chain the smart account signs on (Gnosis, chainId 100). */
export const HOST_CHAIN_ID = chain.id;

export type BridgeErrorLike = { code: string; message: string; rpcCode?: number };

/** The standard EIP-1193 "unrecognized chain" error: the host only runs on Gnosis. */
export function unsupportedChain(): BridgeErrorLike & { rpcCode: 4902 } {
  return { code: 'unsupported', message: 'Diese Mini-App läuft nur auf der Gnosis Chain.', rpcCode: 4902 };
}

/**
 * Throws `unsupportedChain()` unless `chainId` names the host chain (100). `undefined` means
 * "not specified" and is accepted; `100`, `'0x64'` and `'100'` are the accepted spellings.
 */
export function assertHostChain(chainId: unknown): void {
  if (chainId === undefined) return;
  if (chainId === HOST_CHAIN_ID) return;
  if (typeof chainId === 'string') {
    const s = chainId.trim().toLowerCase();
    if (s === `0x${HOST_CHAIN_ID.toString(16)}` || s === String(HOST_CHAIN_ID)) return;
  }
  throw unsupportedChain();
}

/** The `chainId` of a `wallet_switchEthereumChain` / `wallet_addEthereumChain` request. */
function requestedChain(params: unknown[]): unknown {
  const p = params[0];
  if (!p || typeof p !== 'object' || !('chainId' in p)) {
    throw invalidParams('chainId fehlt.');
  }
  return (p as { chainId: unknown }).chainId;
}

export function userRejected(): BridgeErrorLike {
  return { code: 'user_rejected', message: 'Nutzer hat die Aktion abgelehnt.' };
}

function invalidParams(message: string): BridgeErrorLike {
  return { code: 'invalid_params', message };
}

function unsupported(method: string): BridgeErrorLike {
  return { code: 'unsupported', message: `Methode "${method}" wird nicht unterstützt.` };
}

/**
 * Methods that require the native confirm sheet before execution. The shared SDK rule
 * decides (nothing else may); anything it does not know is refused by `handleReadOnly`.
 */
export function isSigningMethod(method: string): boolean {
  return classifyWalletMethod(method) === 'sign';
}

// --- formatting -------------------------------------------------------------

function toBigIntSafe(v: unknown): bigint {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number') return BigInt(Math.trunc(v));
  if (typeof v === 'string' && v.length) {
    try {
      return BigInt(v);
    } catch {
      return 0n;
    }
  }
  return 0n;
}

// --- request parsing --------------------------------------------------------

interface RawTx {
  to?: string;
  from?: string;
  value?: string;
  data?: string;
  gas?: string;
  chainId?: unknown;
}

export interface ParsedRequest {
  method: string;
  params: unknown[];
}

export function normalizeParams(params: unknown[] | object | undefined): unknown[] {
  if (Array.isArray(params)) return params;
  if (params == null) return [];
  return [params];
}

/**
 * Build the confirm-sheet payload for a signing request (miniapp-confirm.ts decides what it
 * says; no row ever shows an address). Returns null for non-signing methods. `names` resolves
 * addresses to display names; the host prefetches them before calling this.
 */
export function buildConfirmRequest(
  app: ConfirmApp,
  method: string,
  params: unknown[],
  names: NameLookup,
): WalletConfirmRequest | null {
  if (method === 'eth_sendTransaction') {
    const tx = (params[0] ?? {}) as RawTx;
    return buildTransactionConfirm(app, [{ to: tx.to, data: tx.data, value: tx.value }], names);
  }
  if (method === 'personal_sign' || method === 'eth_sign') {
    // personal_sign: [message, address]; eth_sign: [address, message]
    return buildMessageConfirm(app, method === 'personal_sign' ? params[0] : params[1], names);
  }
  if (method.startsWith('eth_signTypedData')) {
    return buildTypedDataConfirm(app, params, names);
  }
  return null;
}

// --- execution --------------------------------------------------------------

/**
 * Answer read-only EIP-1193 methods without any confirm sheet. Throws for signing.
 * The trivial methods are answered here; the chain reads in `PROXIED_METHODS` go to the
 * host's rate-limited RPC proxy (one per open). `account` is only given when the app may
 * see the address; reads then default `from` to it.
 */
export async function handleReadOnly(
  method: string,
  params: unknown[],
  account: Account | undefined,
  proxy: RpcProxy | undefined,
): Promise<unknown> {
  if (PROXIED_METHODS.includes(method)) {
    if (!proxy) throw unsupported(method);
    return proxy.request(method, params, { account: account?.address });
  }
  switch (method) {
    case 'eth_chainId':
      return `0x${HOST_CHAIN_ID.toString(16)}`;
    case 'net_version':
      return String(HOST_CHAIN_ID);
    case 'eth_accounts':
    case 'eth_requestAccounts':
      return account?.address ? [account.address] : [];
    case 'wallet_switchEthereumChain':
    case 'wallet_addEthereumChain': {
      // Single-chain host: "switching" to Gnosis is a no-op, any other chain is refused
      // with the standard error instead of pretending to switch.
      const chainId = requestedChain(params);
      if (chainId === undefined) throw invalidParams('chainId fehlt.');
      assertHostChain(chainId);
      return null;
    }
    default:
      throw unsupported(method);
  }
}

/**
 * Execute a signing request against the thirdweb smart account. MUST only be
 * called after the user approved the confirm sheet. Returns the EIP-1193 result
 * (tx hash for sends, signature hex for signs).
 */
export async function executeSigning(
  method: string,
  params: unknown[],
  account: Account,
): Promise<unknown> {
  if (method === 'eth_sendTransaction') {
    const tx = (params[0] ?? {}) as RawTx;
    assertHostChain(tx.chainId);
    if (!tx.to && !tx.data) throw invalidParams('Transaktion braucht `to` oder `data`.');
    const transaction = prepareTransaction({
      client,
      chain,
      to: tx.to,
      value: tx.value ? toBigIntSafe(tx.value) : undefined,
      data: (tx.data as `0x${string}`) || undefined,
    });
    const { transactionHash } = await sendTransaction({ account, transaction });
    return transactionHash;
  }

  if (method === 'personal_sign' || method === 'eth_sign') {
    const message =
      method === 'personal_sign' ? (params[0] as string) : (params[1] as string);
    // thirdweb accounts sign a UTF-8 string or {raw} bytes. Hex payloads are raw.
    if (typeof message === 'string' && message.startsWith('0x')) {
      return account.signMessage({ message: { raw: message as `0x${string}` } });
    }
    return account.signMessage({ message: message ?? '' });
  }

  if (method.startsWith('eth_signTypedData')) {
    const typed = params[1] ?? params[0];
    const obj = typeof typed === 'string' ? JSON.parse(typed) : typed;
    // Runtime-parsed EIP-712 payload; the thirdweb generic can't infer it.
    return account.signTypedData(obj as Parameters<Account['signTypedData']>[0]);
  }

  throw unsupported(method);
}
