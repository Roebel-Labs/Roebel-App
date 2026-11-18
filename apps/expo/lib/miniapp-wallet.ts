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
import { assertHostChain, unsupportedChain, type BridgeErrorLike } from '@/lib/miniapp-chain';
import { callsStatus, capabilities, parseSendCalls, sponsorErrorToBridge } from '@/lib/miniapp-calls';
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

export { assertHostChain, unsupportedChain, type BridgeErrorLike };

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
    case 'wallet_getCapabilities':
      return capabilities();
    case 'wallet_getCallsStatus': {
      const id = params[0];
      if (typeof id !== 'string' || !/^0x[0-9a-fA-F]{1,64}$/.test(id)) throw invalidParams('Ungültige Batch-ID.');
      if (!proxy) throw unsupported(method);
      return callsStatus(id, async (hash) => {
        const r = await proxy.request('eth_getTransactionReceipt', [hash], {});
        return r && typeof r === 'object' ? (r as { status?: unknown }) : null;
      });
    }
    default:
      throw unsupported(method);
  }
}

/** A transaction object as `Account.sendTransaction` takes it (plus the mini-app id hint). */
type DirectTx = { to: string; data?: `0x${string}`; value: bigint; chainId: number; miniAppId?: string };

function directTx(c: { to?: string; data?: string; value?: unknown }, miniAppId: string | undefined): DirectTx {
  return {
    to: c.to as string,
    ...(c.data && c.data !== '0x' ? { data: c.data as `0x${string}` } : {}),
    value: toBigIntSafe(c.value),
    chainId: HOST_CHAIN_ID,
    ...(miniAppId ? { miniAppId } : {}),
  };
}

/** Runs a send and turns a sponsor refusal of a mini-app op into the bridge's German message. */
async function withSponsorErrors<T>(miniAppId: string | undefined, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    const mapped = miniAppId ? sponsorErrorToBridge(e) : null;
    throw mapped ?? e;
  }
}

/**
 * Execute a signing request against the active account. MUST only be called after the user
 * approved the confirm sheet. Returns the EIP-1193 result (tx hash for sends, `{ id }` for
 * `wallet_sendCalls`, signature hex for signs).
 *
 * `opts.miniAppId` (set by the host only for a passkey session sending a version-2 app's
 * declared calls, see `preflightCalls`): every transaction goes to `account.sendTransaction` /
 * `sendBatchTransaction` directly with `miniAppId` and chain 100 attached (thirdweb's
 * `prepareTransaction` would drop the unknown field), so the sponsor can check it in mode
 * "miniapp". Without it, `eth_sendTransaction` takes today's path unchanged.
 */
export async function executeSigning(
  method: string,
  params: unknown[],
  account: Account,
  opts: { miniAppId?: string } = {},
): Promise<unknown> {
  const { miniAppId } = opts;

  if (method === 'eth_sendTransaction') {
    const tx = (params[0] ?? {}) as RawTx;
    assertHostChain(tx.chainId);
    if (!tx.to && !tx.data) throw invalidParams('Transaktion braucht `to` oder `data`.');
    if (miniAppId) {
      if (!tx.to) throw invalidParams('Transaktion braucht `to`.');
      const { transactionHash } = await withSponsorErrors(miniAppId, () =>
        account.sendTransaction(directTx(tx, miniAppId) as never),
      );
      return transactionHash;
    }
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

  if (method === 'wallet_sendCalls') {
    const { calls } = parseSendCalls(params, account.address);
    const txs = calls.map((c) => directTx(c, miniAppId));
    if (txs.length === 1) {
      if (miniAppId) {
        const { transactionHash } = await withSponsorErrors(miniAppId, () => account.sendTransaction(txs[0] as never));
        return { id: transactionHash };
      }
      // One call without a mini-app id: today's eth_sendTransaction path.
      const transaction = prepareTransaction({
        client,
        chain,
        to: txs[0].to,
        value: txs[0].value > 0n ? txs[0].value : undefined,
        data: txs[0].data,
      });
      const { transactionHash } = await sendTransaction({ account, transaction });
      return { id: transactionHash };
    }
    if (typeof account.sendBatchTransaction !== 'function') {
      throw { code: 'unsupported', message: 'Dieses Konto kann mehrere Aktionen nicht zusammen senden.' };
    }
    const sendBatch = account.sendBatchTransaction.bind(account);
    const { transactionHash } = await withSponsorErrors(miniAppId, () => sendBatch(txs as never));
    return { id: transactionHash };
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
