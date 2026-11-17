/**
 * Guest as a self-claimed token (spec 5.1): a non-citizen claims Guest in the same sponsored
 * operation as their first on-chain action (citizenship request, collecting Röbel Münzen,
 * publicly accepting an Ausweis).
 *
 * Guest must never block the real action: when an operation carrying the Guest call fails for
 * any reason other than the person cancelling, the real action is sent once more without it,
 * and Guest is not tried again on this device for 24 hours.
 *
 * Gate closed, no registry configured, a citizen, already held, or any read error → no Guest
 * call: the caller's operation goes out exactly as it did before this feature.
 * Never logs: errors can carry addresses or call data.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RESERVED_TYPE_IDS, selfClaimCall } from '@netizen-labs/credential-registry';
import type { Account } from 'thirdweb/wallets';
import type { Address, Hex } from 'viem';
import { sendOrgCalls, sendOrgCallsKeepingHash } from '@/lib/org-safe/send';
import type { Call } from '@/lib/org-safe/ops';
import { REGISTRY, registryReader } from './chain';
import { credentialsConfigured, isCredentialsAllowed } from './gate';

export type { Call };

/** A known answer, or a check that runs only when everything else says "add Guest". */
export type CitizenCheck = boolean | (() => Promise<boolean>);

type Storage = { getItem: (k: string) => Promise<string | null>; setItem: (k: string, v: string) => Promise<void> };

export type GuestDeps = {
  /** Sync: a registry address is configured (checked first, no network when false). */
  configured: () => boolean;
  /** The rollout gate (app settings). */
  allowed: () => Promise<boolean>;
  holds: (typeId: Hex, account: Address) => Promise<boolean>;
  storage: Storage;
  now: () => number;
  /** The plain send, used whenever no Guest call is added (unchanged behaviour). */
  send: (account: Account, calls: readonly Call[]) => Promise<Hex | null>;
  /** The send with the Guest call: tells "never went out" from "went out, receipt unknown". */
  sendKeepingHash: (account: Account, calls: readonly Call[]) => Promise<{ txHash: Hex; confirmed: boolean } | null>;
};

const defaultDeps: GuestDeps = {
  configured: credentialsConfigured,
  allowed: isCredentialsAllowed,
  holds: (typeId, account) => registryReader().holds(typeId, account),
  storage: AsyncStorage,
  now: () => Date.now(),
  send: sendOrgCalls,
  sendKeepingHash: sendOrgCallsKeepingHash,
};

export const GUEST_SKIP_MS = 24 * 60 * 60 * 1000;
export const guestSkipKey = (address: string) => `credreg:guest-skip:${address.toLowerCase()}`;

/** Per app session: does the address hold Guest? (Only answers that were read or just sent.) */
const heldCache = new Map<string, boolean>();

export function __resetGuestCacheForTests(): void {
  heldCache.clear();
}

/** Thrown inside a sender when the operation already went out: it must not be sent again. */
class AlreadySent extends Error {
  constructor(readonly original: unknown) {
    super('operation already sent');
    this.name = 'AlreadySent';
  }
}

function isCancellation(e: unknown): boolean {
  const name = (e as { name?: unknown } | null)?.name;
  const message = (e as { message?: unknown } | null)?.message;
  if (typeof name === 'string' && /cancel/i.test(name)) return true;
  return typeof message === 'string' && /abgebrochen|user (cancel|reject|denied)|cancelled by the user/i.test(message);
}

async function skippedUntilLater(address: string, d: GuestDeps): Promise<boolean> {
  const raw = await d.storage.getItem(guestSkipKey(address));
  if (!raw) return false;
  const at = Number(raw);
  return Number.isFinite(at) && d.now() - at < GUEST_SKIP_MS;
}

async function rememberSkip(address: string, d: GuestDeps): Promise<void> {
  try {
    await d.storage.setItem(guestSkipKey(address), String(d.now()));
  } catch {
    // best effort: worst case Guest is tried once more next time
  }
}

/**
 * The Guest self-claim call when this account should carry it, else null. Never throws.
 */
export async function guestCallIfNeeded(
  p: { address: Address; isCitizen: CitizenCheck },
  deps: Partial<GuestDeps> = {},
): Promise<Call | null> {
  const d = { ...defaultDeps, ...deps };
  try {
    if (!d.configured()) return null;
    if (p.isCitizen === true) return null;
    const key = p.address.toLowerCase();
    if (heldCache.get(key) === true) return null;
    if (!(await d.allowed())) return null;
    if (await skippedUntilLater(key, d)) return null;
    if (typeof p.isCitizen === 'function' && (await p.isCitizen())) return null;
    let held = heldCache.get(key);
    if (held === undefined) {
      held = await d.holds(RESERVED_TYPE_IDS.guest, p.address);
      heldCache.set(key, held);
    }
    if (held) return null;
    return selfClaimCall(REGISTRY, RESERVED_TYPE_IDS.guest);
  } catch {
    return null;
  }
}

/**
 * Runs an operation with the Guest call when needed. `run(guest)` sends the real calls, with
 * `guest` first when it is not null. When the run with Guest fails (not a cancellation, not an
 * operation that already went out) it runs once more with null and Guest is skipped for 24 hours.
 * Without a Guest call `run(null)` runs exactly once, as before.
 */
export async function withGuestClaim<T>(
  p: { address: Address; isCitizen: CitizenCheck },
  run: (guest: Call | null) => Promise<T>,
  deps: Partial<GuestDeps> = {},
): Promise<T> {
  const d = { ...defaultDeps, ...deps };
  const unwrap = (e: unknown) => (e instanceof AlreadySent ? e.original : e);
  const guest = await guestCallIfNeeded(p, d);
  if (!guest) {
    try {
      return await run(null);
    } catch (e) {
      throw unwrap(e);
    }
  }
  try {
    const result = await run(guest);
    heldCache.set(p.address.toLowerCase(), true);
    return result;
  } catch (e) {
    if (e instanceof AlreadySent || isCancellation(e)) throw unwrap(e);
    await rememberSkip(p.address, d);
  }
  try {
    return await run(null);
  } catch (e) {
    throw unwrap(e);
  }
}

/**
 * sendOrgCalls with the Guest call first when needed (one operation). Resolves with the hash once
 * the receipt is there; null when there was nothing to send. Without a Guest call this is exactly
 * `sendOrgCalls(account, calls)`.
 */
export async function sendWithGuestClaim(
  account: Account,
  calls: readonly Call[],
  p: { isCitizen: CitizenCheck },
  deps: Partial<GuestDeps> = {},
): Promise<Hex | null> {
  const d = { ...defaultDeps, ...deps };
  if (calls.length === 0) return null;
  return withGuestClaim(
    { address: account.address as Address, isCitizen: p.isCitizen },
    async (guest) => {
      if (!guest) return d.send(account, calls);
      const sent = await d.sendKeepingHash(account, [guest, ...calls]);
      if (!sent) return null;
      // Out, but the receipt is unknown: sending again could do the real action twice.
      if (!sent.confirmed) throw new AlreadySent(new Error('receipt not confirmed'));
      return sent.txHash;
    },
    d,
  );
}
