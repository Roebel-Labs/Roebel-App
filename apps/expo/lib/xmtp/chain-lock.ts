/**
 * XMTP binds a smart-contract-wallet identity to the chain it was FIRST
 * registered from, permanently. After the 2026-07-27 move from Base to Gnosis
 * the network rejects every new installation for a wallet that registered on
 * Base: "Wrong chain id. Initially added with 8453 but now signing from 100".
 *
 * Decision (Max, 2026-09-04): stay Gnosis-only and accept that those inboxes
 * are gone. This module makes that outcome CLEAN instead of a failed signature
 * and a red error on every app start: the first time the network says so, the
 * wallet is marked chain-locked on this device, its peer-readiness flag is
 * cleared, and later boots skip XMTP silently. DMs stay on the Supabase rail,
 * which is the documented fallback for any XMTP failure.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const CHAIN_LOCK_PREFIX = '@xmtp_chain_locked_';

/** "Initially added with <bound> but now signing from <signing>" */
const FOREIGN_CHAIN_PATTERN = /Initially added with (\d+) but now signing from (\d+)/;

export interface ForeignChainLock {
  /** The chain the network has this identity bound to. */
  boundChainId: number;
  /** The chain this app signed with. */
  signingChainId: number;
}

/** Recognises the network's chain-mismatch rejection in any error shape. */
export function parseForeignChainLock(err: unknown): ForeignChainLock | null {
  const text =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : String((err as { message?: unknown } | null)?.message ?? '');
  const match = FOREIGN_CHAIN_PATTERN.exec(text);
  if (!match) return null;
  const boundChainId = Number(match[1]);
  const signingChainId = Number(match[2]);
  if (!Number.isFinite(boundChainId) || !Number.isFinite(signingChainId)) return null;
  if (boundChainId === signingChainId) return null;
  return { boundChainId, signingChainId };
}

/** Thrown by boot when a wallet is known to be bound to another chain. */
export class XmtpChainLockedError extends Error {
  readonly boundChainId: number;

  constructor(boundChainId: number) {
    super(`XMTP identity is bound to chain ${boundChainId}`);
    this.name = 'XmtpChainLockedError';
    this.boundChainId = boundChainId;
  }
}

function storageKey(wallet: string): string {
  return `${CHAIN_LOCK_PREFIX}${wallet.toLowerCase()}`;
}

export async function getXmtpChainLock(wallet: string): Promise<number | null> {
  const raw = await AsyncStorage.getItem(storageKey(wallet));
  if (!raw) return null;
  const chainId = Number(raw);
  return Number.isFinite(chainId) && chainId > 0 ? chainId : null;
}

export async function setXmtpChainLock(wallet: string, chainId: number): Promise<void> {
  await AsyncStorage.setItem(storageKey(wallet), String(chainId));
}

export async function clearXmtpChainLock(wallet: string): Promise<void> {
  await AsyncStorage.removeItem(storageKey(wallet));
}
