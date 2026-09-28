/**
 * "E-Mail oder Google als Helfer": a thirdweb login (Google / Apple / E-Mail) whose Gnosis smart
 * account becomes ONE guardian of the passkey Safe. It is a recovery helper only — never an owner,
 * never a login to the passkey account.
 *
 *   add (old phone, passkey session):  thirdweb login outside the connection manager → its smart
 *     account address → SRM.addGuardianWithThreshold(helper, t) in ONE sponsored passkey op.
 *   use (new phone, "Konto wiederherstellen"): the same thirdweb login → that smart account calls
 *     SRM.confirmRecovery(wallet, [newSigner], 1, false) itself, gas via thirdweb's own
 *     sponsorship (sponsorGas: true) → the existing flow continues (executeRecovery, 3 days, finalize).
 *
 * Pure: planning, labels, masking and the confirm-step state. Wiring: recovery-helper-runtime.ts.
 */
import { getAddress, isAddressEqual, type Address } from 'viem';
import { SOCIAL_RECOVERY_SENTINEL } from './constants';
import { clampThreshold } from './guardian-plan';
import { encodeAddGuardian, encodeConfirmRecovery } from './guardians';
import type { SponsoredCall } from './userop';

export type HelperKind = 'google' | 'apple' | 'email';

export type HelperMeta = {
  kind: HelperKind;
  /** Masked login identity ("m•••3@gmail.com"); never the raw email, never an address. */
  masked: string | null;
};

export const HELPERS_STORE_KEY = 'passkey_recovery_helpers_v1';

const same = (a: Address, b: Address) => isAddressEqual(a, b);

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export function helperLabel(kind: HelperKind): string {
  if (kind === 'google') return 'Google-Konto (Helfer)';
  if (kind === 'apple') return 'Apple-Konto (Helfer)';
  return 'E-Mail-Konto (Helfer)';
}

/** "max.brych@gmail.com" → "m•••h@gmail.com"; short local parts keep only the first letter. */
export function maskEmail(email: string | null | undefined): string | null {
  const e = email?.trim();
  if (!e) return null;
  const at = e.lastIndexOf('@');
  if (at <= 0 || at === e.length - 1) return null;
  const local = e.slice(0, at);
  const domain = e.slice(at + 1).toLowerCase();
  const masked = local.length <= 2 ? `${local[0]}•••` : `${local[0]}•••${local[local.length - 1]}`;
  return `${masked}@${domain}`;
}

/** The guardian row for a helper: the label as name, the masked identity as detail. */
export function helperDisplay(meta: HelperMeta): { name: string; detail: string | null } {
  return { name: helperLabel(meta.kind), detail: meta.masked };
}

export function parseHelpers(raw: string | null | undefined): Record<string, HelperMeta> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as Record<string, HelperMeta>;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    const out: Record<string, HelperMeta> = {};
    for (const [k, m] of Object.entries(v)) {
      if (!/^0x[0-9a-f]{40}$/.test(k)) continue;
      if (m?.kind !== 'google' && m?.kind !== 'apple' && m?.kind !== 'email') continue;
      out[k] = { kind: m.kind, masked: typeof m.masked === 'string' ? m.masked : null };
    }
    return out;
  } catch {
    return {};
  }
}

export function withHelper(helpers: Record<string, HelperMeta>, address: Address, meta: HelperMeta): Record<string, HelperMeta> {
  return { ...helpers, [address.toLowerCase()]: { kind: meta.kind, masked: meta.masked } };
}

// ---------------------------------------------------------------------------
// Adding the helper
// ---------------------------------------------------------------------------

export type AddHelperPlan =
  | {
      kind: 'add';
      calls: SponsoredCall[];
      helper: Address;
      threshold: number;
      /** The helper is the only guardian (threshold 1): show the 3-day delay + cancel explanation. */
      onlyGuardian: boolean;
    }
  | { kind: 'self' }
  | { kind: 'exists' }
  | { kind: 'invalid' };

/**
 * Threshold rule: the only guardian → threshold 1; otherwise the user's threshold stays as it is
 * (clamped into [1, count], so a stored 0 becomes 1). The helper can never be the wallet itself or
 * the legacy account the wallet administers (that login is the person's own account, not a helper).
 */
export function planAddRecoveryHelper(p: {
  wallet: Address;
  legacy?: Address | null;
  current: readonly Address[];
  currentThreshold: number;
  helper: Address;
}): AddHelperPlan {
  let helper: Address;
  try {
    helper = getAddress(p.helper);
  } catch {
    return { kind: 'invalid' };
  }
  if (/^0x0{40}$/i.test(helper) || same(helper, SOCIAL_RECOVERY_SENTINEL)) return { kind: 'invalid' };
  if (same(helper, p.wallet) || (p.legacy && same(helper, p.legacy))) return { kind: 'self' };
  if (p.current.some((g) => same(g, helper))) return { kind: 'exists' };
  const onlyGuardian = p.current.length === 0;
  const threshold = onlyGuardian ? 1 : clampThreshold(p.currentThreshold, p.current.length + 1);
  return { kind: 'add', calls: [encodeAddGuardian(helper, threshold)], helper, threshold, onlyGuardian };
}

// ---------------------------------------------------------------------------
// Using the helper on a new phone
// ---------------------------------------------------------------------------

export type HelperConfirmPlan =
  | { kind: 'confirm'; call: SponsoredCall }
  | { kind: 'notGuardian' }
  | { kind: 'self' };

/** confirmRecovery(wallet, [signer], 1, false) when the helper really is a guardian of `wallet`. */
export function planHelperConfirm(p: {
  wallet: Address;
  signer: Address;
  guardians: readonly Address[];
  helper: Address;
}): HelperConfirmPlan {
  if (same(p.helper, p.wallet)) return { kind: 'self' };
  if (!p.guardians.some((g) => same(g, p.helper))) return { kind: 'notGuardian' };
  return { kind: 'confirm', call: encodeConfirmRecovery(p.wallet, [p.signer], 1, false) };
}

/**
 * The "Mit E-Mail oder Google bestätigen" step inside "Konto wiederherstellen":
 *   idle → signingIn → checking → confirming → confirmed
 *                  ↘ idle (cancelled)   ↘ failed (not a guardian / error; retry → idle)
 */
export type HelperStep = 'idle' | 'signingIn' | 'checking' | 'confirming' | 'confirmed' | 'failed';
export type HelperState = { step: HelperStep; message: string | null };

export type HelperEvent =
  | { type: 'start' }
  | { type: 'signedIn' }
  | { type: 'cancelled' }
  | { type: 'planned'; plan: HelperConfirmPlan }
  | { type: 'sent' }
  | { type: 'error'; message?: string }
  | { type: 'reset' };

export const HELPER_IDLE: HelperState = { step: 'idle', message: null };

export const HELPER_NOT_GUARDIAN =
  'Dieses Konto ist keine Vertrauensperson für dieses Konto. Nimm das Google- oder E-Mail-Konto, das du als Helfer eingetragen hast.';
export const HELPER_SELF = 'Mit diesem Konto kannst du dich nicht selbst bestätigen.';
export const HELPER_FAILED = 'Das hat nicht geklappt. Bitte versuche es erneut.';
export const HELPER_CONFIRMED = 'Dein Helfer-Konto hat bestätigt.';

export function helperReducer(s: HelperState, e: HelperEvent): HelperState {
  switch (e.type) {
    case 'start':
      return s.step === 'idle' || s.step === 'failed' ? { step: 'signingIn', message: null } : s;
    case 'signedIn':
      return s.step === 'signingIn' ? { step: 'checking', message: null } : s;
    case 'cancelled':
      return s.step === 'confirmed' ? s : HELPER_IDLE;
    case 'planned':
      if (s.step !== 'checking') return s;
      if (e.plan.kind === 'confirm') return { step: 'confirming', message: null };
      return { step: 'failed', message: e.plan.kind === 'self' ? HELPER_SELF : HELPER_NOT_GUARDIAN };
    case 'sent':
      return s.step === 'confirming' ? { step: 'confirmed', message: HELPER_CONFIRMED } : s;
    case 'error':
      return s.step === 'confirmed' ? s : { step: 'failed', message: e.message ?? HELPER_FAILED };
    case 'reset':
      return HELPER_IDLE;
    default:
      return s;
  }
}

/** Buttons are disabled while a step runs. */
export function helperBusy(s: HelperState): boolean {
  return s.step === 'signingIn' || s.step === 'checking' || s.step === 'confirming';
}
