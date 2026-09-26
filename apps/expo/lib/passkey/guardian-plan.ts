/**
 * Pure planning for the "Vertrauenspersonen" UI: which SRM calls one guardian change needs, the
 * threshold rules, which sponsor mode an op runs in, and the guardian-side confirm call.
 *
 * Candide SRM rules the plans respect (GuardianManager):
 *  - a guardian is never the wallet itself, never 0x0 / the sentinel, never added twice;
 *  - every add/revoke carries the threshold to apply afterwards, 1 <= threshold <= guardian count.
 * Our product rules (spec "Backup and recovery"): default threshold 2 (or the count if smaller),
 * never above the count, and warn when every guardian is an attester (mix in a family member).
 */
import { encodeFunctionData, getAddress, isAddressEqual, type Address } from 'viem';
import { SOCIAL_RECOVERY_MODULE, SOCIAL_RECOVERY_SENTINEL } from './constants';
import {
  encodeAddGuardian,
  encodeChangeThreshold,
  encodeConfirmRecovery,
  encodeRevokeGuardian,
  prevGuardianOf,
} from './guardians';
import type { MigrationRecord } from './migration';
import type { SponsoredCall } from './userop';

export const DEFAULT_GUARDIAN_THRESHOLD = 2;

const same = (a: Address, b: Address) => isAddressEqual(a, b);
const includesAddr = (list: readonly Address[], a: Address) => list.some((x) => same(x, a));

/** The default "wie viele müssen zustimmen" for `count` guardians: 2, or fewer if there are fewer. */
export function defaultThreshold(count: number): number {
  if (count <= 0) return 0;
  return Math.min(DEFAULT_GUARDIAN_THRESHOLD, count);
}

/** Clamps a wanted threshold into [1, count] (0 when there are no guardians). */
export function clampThreshold(wanted: number, count: number): number {
  if (count <= 0) return 0;
  if (!Number.isFinite(wanted)) return defaultThreshold(count);
  return Math.min(Math.max(1, Math.floor(wanted)), count);
}

export function isValidThreshold(t: number, count: number): boolean {
  return Number.isInteger(t) && t >= 1 && t <= count;
}

/** "2 von 3 müssen zustimmen" */
export function thresholdLabel(threshold: number, count: number): string {
  if (count <= 0) return 'Noch keine Vertrauenspersonen';
  if (count === 1) return 'Diese Person muss zustimmen';
  if (threshold >= count) return `Alle ${count} müssen zustimmen`;
  return `${threshold} von ${count} müssen zustimmen`;
}

/**
 * addGuardianWithThreshold for every new guardian (duplicates, existing guardians, the wallet
 * itself and reserved addresses dropped), each carrying a threshold that is valid at that point;
 * the last one sets the target. Returns [] when nothing is new.
 */
export function planAddGuardians(p: {
  wallet: Address;
  current: readonly Address[];
  currentThreshold: number;
  add: readonly Address[];
  /** Target threshold after all adds (default: max(current, 2) clamped to the new count). */
  threshold?: number;
}): { calls: SponsoredCall[]; added: Address[]; threshold: number } {
  const added: Address[] = [];
  for (const raw of p.add) {
    const a = getAddress(raw);
    if (same(a, p.wallet) || same(a, SOCIAL_RECOVERY_SENTINEL) || /^0x0{40}$/i.test(a)) continue;
    if (includesAddr(p.current, a) || includesAddr(added, a)) continue;
    added.push(a);
  }
  const finalCount = p.current.length + added.length;
  const target = clampThreshold(
    p.threshold ?? Math.max(p.currentThreshold, defaultThreshold(finalCount)),
    finalCount,
  );
  if (added.length === 0) return { calls: [], added, threshold: clampThreshold(p.currentThreshold, finalCount) };
  const calls = added.map((g, i) => {
    const countAfter = p.current.length + i + 1;
    const t = i === added.length - 1 ? target : Math.max(1, Math.min(target, countAfter));
    return encodeAddGuardian(g, t);
  });
  return { calls, added, threshold: target };
}

/**
 * revokeGuardianWithThreshold(prev, guardian, t): t = the current threshold, lowered to the new
 * count so it never exceeds it. Removing the last guardian keeps the stored threshold (the SRM
 * then has no guardians and no recovery can start).
 */
export function planRemoveGuardian(p: {
  current: readonly Address[];
  currentThreshold: number;
  guardian: Address;
}): { call: SponsoredCall; threshold: number } {
  const prev = prevGuardianOf(p.current, p.guardian);
  const newCount = p.current.length - 1;
  const threshold = newCount === 0 ? Math.max(1, p.currentThreshold) : clampThreshold(p.currentThreshold, newCount);
  return { call: encodeRevokeGuardian(prev, getAddress(p.guardian), threshold), threshold };
}

export function planChangeThreshold(count: number, wanted: number): SponsoredCall {
  if (!isValidThreshold(wanted, count)) throw new Error(`threshold must be between 1 and ${count}`);
  return encodeChangeThreshold(wanted);
}

/** True when there are guardians and every one of them is an attester (spec: mix in family). */
export function allGuardiansAreAttesters(guardians: readonly Address[], isAttester: (a: Address) => boolean): boolean {
  return guardians.length > 0 && guardians.every((g) => isAttester(g));
}

/**
 * Suggested default guardians that are not guardians yet (and never the wallet / its legacy).
 */
export function pendingSuggestions(p: {
  suggested: readonly Address[];
  current: readonly Address[];
  exclude: readonly Address[];
}): Address[] {
  const out: Address[] = [];
  for (const s of p.suggested) {
    if (includesAddr(p.current, s) || includesAddr(p.exclude, s) || includesAddr(out, s)) continue;
    out.push(getAddress(s));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Sponsor mode for ops sent by the user's own Safe (guardian management, cancelRecovery)
// ---------------------------------------------------------------------------

export type IdentityMode = { mode: 'safe' } | { mode: 'legacy'; legacy: Address };

/**
 * mode "safe" once the Safe itself holds citizenship (after the v3 moveTo); else mode "legacy"
 * through the citizen legacy account the Safe administers; null = nothing the sponsor would pay
 * for (e.g. a family member's Safe without citizenship).
 */
export function identityModeFor(p: {
  record: Pick<MigrationRecord, 'legacy' | 'status'>;
  safeIsCitizen: boolean;
  legacyIsCitizen: boolean;
}): IdentityMode | null {
  if (p.safeIsCitizen) return { mode: 'safe' };
  if (p.record.legacy && p.record.status === 'done' && p.legacyIsCitizen) return { mode: 'legacy', legacy: p.record.legacy };
  return null;
}

// ---------------------------------------------------------------------------
// Guardian side of a recovery
// ---------------------------------------------------------------------------

const accountExecuteAbi = [
  {
    type: 'function',
    name: 'execute',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_target', type: 'address' },
      { name: '_value', type: 'uint256' },
      { name: '_calldata', type: 'bytes' },
    ],
    outputs: [],
  },
] as const;

export type GuardianConfirmPlan =
  | { kind: 'safe'; calls: SponsoredCall[]; recoveryLegacy?: Address }
  | { kind: 'legacy'; calls: SponsoredCall[]; legacy: Address }
  | { kind: 'notGuardian' }
  | { kind: 'self' };

/**
 * Which of MY identities is a guardian of `wallet`, and the one call that confirms
 * newOwners = [signer], threshold 1 (execute=false: the new phone starts the delay):
 *  - my passkey Safe → SRM.confirmRecovery directly (sponsor mode "recovery", or "safe" if my Safe
 *    is a citizen); `recoveryLegacy` passes the link's legacy hint for a wallet without an NFT;
 *  - my legacy account (an attester added by the suggestion) → legacy.execute(SRM, confirm)
 *    (sponsor mode "legacy", my Safe is its admin).
 */
export function planGuardianConfirm(p: {
  wallet: Address;
  signer: Address;
  guardians: readonly Address[];
  mySafe: Address;
  myLegacy?: Address | null;
  recoveryLegacy?: Address | null;
}): GuardianConfirmPlan {
  if (same(p.wallet, p.mySafe) || (p.myLegacy && same(p.wallet, p.myLegacy))) return { kind: 'self' };
  const confirm = encodeConfirmRecovery(p.wallet, [p.signer], 1, false);
  if (includesAddr(p.guardians, p.mySafe)) {
    return { kind: 'safe', calls: [confirm], ...(p.recoveryLegacy ? { recoveryLegacy: p.recoveryLegacy } : {}) };
  }
  if (p.myLegacy && includesAddr(p.guardians, p.myLegacy)) {
    const data = encodeFunctionData({
      abi: accountExecuteAbi,
      functionName: 'execute',
      args: [SOCIAL_RECOVERY_MODULE, 0n, confirm.data],
    });
    return { kind: 'legacy', calls: [{ to: p.myLegacy, data }], legacy: p.myLegacy };
  }
  return { kind: 'notGuardian' };
}

// ---------------------------------------------------------------------------
// v3 final migration step
// ---------------------------------------------------------------------------

export type V3MovePlan =
  | { kind: 'done' }
  | { kind: 'handoverFirst' }
  | { kind: 'nothingToMove' }
  | { kind: 'move'; moveCitizen: boolean; moveAttester: boolean };

/**
 * "Bürgerschaft auf deinen Passkey übertragen": the move runs after the handover (the v3
 * contract checks legacy.isAdmin(safe)). `tokens` = what the legacy account / the Safe hold on v3.
 */
export function planV3Move(p: {
  safeIsAdmin: boolean;
  legacy: { citizenV3: boolean; attesterV3: boolean };
  safe: { citizenV3: boolean; attesterV3: boolean };
}): V3MovePlan {
  const moveCitizen = p.legacy.citizenV3 && !p.safe.citizenV3;
  const moveAttester = p.legacy.attesterV3 && !p.safe.attesterV3;
  if (!moveCitizen && !moveAttester) return p.safe.citizenV3 || p.safe.attesterV3 ? { kind: 'done' } : { kind: 'nothingToMove' };
  if (!p.safeIsAdmin) return { kind: 'handoverFirst' };
  return { kind: 'move', moveCitizen, moveAttester };
}
