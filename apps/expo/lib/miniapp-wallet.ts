/**
 * EIP-1193 helpers for the Mini App host wallet bridge.
 *
 * A mini app talks to an injected EIP-1193 provider (`wallet.request`). The host
 * (MiniAppHost) forwards each request here:
 *  - read-only / trivial methods (`eth_chainId`, `eth_accounts`, `eth_requestAccounts`)
 *    are answered directly;
 *  - signing methods (`eth_sendTransaction`, `personal_sign`, `eth_signTypedData*`)
 *    are decoded into a `WalletConfirmRequest` for the native confirm sheet, then
 *    executed against the thirdweb smart account only after the user approves.
 *
 * No blind signing (spec §4.2). Rejection surfaces `{ code: 'user_rejected' }`.
 */
import type { Account } from 'thirdweb/wallets';
import { prepareTransaction, sendTransaction } from 'thirdweb';
import { client, chain } from '@/constants/thirdweb';
import type { WalletConfirmRequest } from '@/components/miniapp/WalletConfirmSheet';

/** Host chain the smart account is configured for (Base). */
export const HOST_CHAIN_ID = chain.id;

export type BridgeErrorLike = { code: string; message: string };

export function userRejected(): BridgeErrorLike {
  return { code: 'user_rejected', message: 'Nutzer hat die Aktion abgelehnt.' };
}

function invalidParams(message: string): BridgeErrorLike {
  return { code: 'invalid_params', message };
}

function unsupported(method: string): BridgeErrorLike {
  return { code: 'unsupported', message: `Methode "${method}" wird nicht unterstützt.` };
}

/** Methods that require the native confirm sheet before execution. */
const SIGNING_METHODS = new Set([
  'eth_sendTransaction',
  'personal_sign',
  'eth_sign',
  'eth_signTypedData',
  'eth_signTypedData_v3',
  'eth_signTypedData_v4',
]);

export function isSigningMethod(method: string): boolean {
  return SIGNING_METHODS.has(method);
}

// --- shortening / formatting -----------------------------------------------

export function shortAddress(addr?: string | null): string {
  if (!addr) return 'unbekannt';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function toBigIntSafe(v: unknown): bigint {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number') return BigInt(Math.trunc(v));
  if (typeof v === 'string' && v.length) {
    try {
      return v.startsWith('0x') ? BigInt(v) : BigInt(v);
    } catch {
      return 0n;
    }
  }
  return 0n;
}

/** Format a wei bigint into a short human ETH/xDAI string. */
function formatWei(wei: bigint): string {
  if (wei === 0n) return '0';
  const whole = wei / 10n ** 18n;
  const frac = (wei % 10n ** 18n).toString().padStart(18, '0').slice(0, 4).replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}`;
}

function decodeUtf8Maybe(hexOrText: string): string {
  if (typeof hexOrText !== 'string') return String(hexOrText);
  if (!hexOrText.startsWith('0x')) return hexOrText;
  try {
    const bytes = hexOrText.slice(2).match(/.{1,2}/g) ?? [];
    const decoded = bytes.map((b) => String.fromCharCode(parseInt(b, 16))).join('');
    // Heuristic: if it's mostly printable, show the decoded text.
    // eslint-disable-next-line no-control-regex
    if (/^[\x09\x0A\x0D\x20-\x7E -￿]*$/.test(decoded)) return decoded;
  } catch {
    /* fall through */
  }
  return hexOrText;
}

// --- request parsing --------------------------------------------------------

interface RawTx {
  to?: string;
  from?: string;
  value?: string;
  data?: string;
  gas?: string;
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
 * Build the confirm-sheet payload for a signing request. Returns null for
 * non-signing methods.
 */
export function buildConfirmRequest(
  appName: string,
  method: string,
  params: unknown[],
  selfAddress: string | undefined,
): WalletConfirmRequest | null {
  if (method === 'eth_sendTransaction') {
    const tx = (params[0] ?? {}) as RawTx;
    const value = toBigIntSafe(tx.value);
    const rows: WalletConfirmRequest['rows'] = [
      { label: 'Empfänger', value: shortAddress(tx.to), mono: true },
    ];
    if (value > 0n) {
      rows.push({ label: 'Betrag', value: `${formatWei(value)}` });
    }
    if (tx.data && tx.data !== '0x') {
      rows.push({ label: 'Aktion', value: 'Vertrags-Interaktion' });
    }
    return {
      kind: 'transaction',
      title: 'Transaktion bestätigen',
      appName,
      rows,
      raw: tx.data && tx.data !== '0x' ? tx.data : undefined,
    };
  }

  if (method === 'personal_sign' || method === 'eth_sign') {
    // personal_sign: [message, address]; eth_sign: [address, message]
    const msg =
      method === 'personal_sign' ? (params[0] as string) : (params[1] as string);
    return {
      kind: 'personal_sign',
      title: 'Nachricht signieren',
      appName,
      rows: [{ label: 'Nachricht', value: decodeUtf8Maybe(msg ?? '') }],
    };
  }

  if (method.startsWith('eth_signTypedData')) {
    const typed = params[1] ?? params[0];
    let summary = '';
    try {
      const obj = typeof typed === 'string' ? JSON.parse(typed) : typed;
      summary = obj?.primaryType ? `Typ: ${obj.primaryType}` : 'Strukturierte Daten';
    } catch {
      summary = 'Strukturierte Daten';
    }
    return {
      kind: 'typed_data',
      title: 'Daten signieren',
      appName,
      rows: [{ label: 'Inhalt', value: summary }],
      raw: typeof typed === 'string' ? typed : JSON.stringify(typed, null, 2),
    };
  }

  return null;
}

// --- execution --------------------------------------------------------------

/** Answer read-only EIP-1193 methods without any confirm sheet. Throws for signing. */
export async function handleReadOnly(
  method: string,
  account: Account | undefined,
): Promise<unknown> {
  switch (method) {
    case 'eth_chainId':
      return `0x${HOST_CHAIN_ID.toString(16)}`;
    case 'net_version':
      return String(HOST_CHAIN_ID);
    case 'eth_accounts':
    case 'eth_requestAccounts':
      return account?.address ? [account.address] : [];
    case 'wallet_switchEthereumChain':
    case 'wallet_addEthereumChain':
      // Single-chain host; treat as no-op success.
      return null;
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
