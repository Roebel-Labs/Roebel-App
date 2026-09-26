/**
 * "Konto wiederherstellen" on a new phone — the state machine (no UI, every side effect injected).
 *
 *   idle → creatingPasskey → waitingForGuardians → executing → waitingDelay → finalizing → done
 *                                                                          ↘ cancelled | error
 *
 * 1. creatingPasskey: a NEW passkey on this phone; its per-key Safe owner is
 *    signer = SafeWebAuthnSignerFactory.getSigner(x, y). The phone shows
 *    roebel://passkey/recover?wallet&signer&name to the guardians.
 * 2. waitingForGuardians: guardians confirm ON-CHAIN (confirmRecovery(wallet, [signer], 1)); we
 *    poll getRecoveryApprovals until it reaches the wallet's threshold.
 * 3. executing: one sponsored op from this phone's fresh passkey Safe (deploys it):
 *    [createSigner(x, y), executeRecovery(wallet, [signer], 1)] — sponsor mode "recovery".
 * 4. waitingDelay: the SRM holds the request for 3 days; the owner may cancel. A request that
 *    disappears means cancelled — unless the wallet's owners already are [signer] (anyone may
 *    call the public finalizeRecovery), which means done.
 * 5. finalizing: [finalizeRecovery(wallet)], then `saveRecoveredRecord` (ownerType webauthnSigner)
 *    so the app operates the recovered Safe.
 *
 * The state is persisted (SecureStore) after every transition, so closing the app is safe; a
 * cancelled passkey sheet leaves nothing behind.
 */
import { getAddress, isAddressEqual, type Address, type Hex } from 'viem';
import { encodeCreateSigner, encodeExecuteRecovery, encodeFinalizeRecovery, type RecoveryRequest } from './guardians';
import { saveRecoveredRecord, type KeyValueStorage } from './migration';
import { predictSafeAddress } from './safe-address';
import type { PasskeyUserOpArgs } from './userop';
import type { PasskeyCredential } from './webauthn';

export const RECOVERY_STORE_KEY = 'passkey_recovery_v1';

export type RecoveryStep =
  | 'idle'
  | 'creatingPasskey'
  | 'waitingForGuardians'
  | 'executing'
  | 'waitingDelay'
  | 'finalizing'
  | 'done'
  | 'cancelled'
  | 'error';

export type RecoveryState = {
  step: RecoveryStep;
  /** The passkey Safe being recovered (its address survives the recovery). */
  wallet: Address;
  /** Sponsor hint: the legacy account the wallet administers (when the wallet holds no NFT). */
  recoveryLegacy: Address | null;
  /** Display name of the person (from the profile search) — display only. */
  name: string;
  credentialId?: string;
  x?: Hex;
  y?: Hex;
  /** This phone's fresh passkey Safe (sender of the recovery ops). */
  newSafe?: Address;
  /** The new owner the recovery installs: getSigner(x, y). */
  signer?: Address;
  /** Unix seconds when finalizeRecovery becomes possible. */
  executeAfter?: number;
  approvals?: number;
  threshold?: number;
  /** German, user-facing. */
  message?: string;
  /** Technical detail for logs only. */
  detail?: string;
};

export type RecoveryStorage = KeyValueStorage & { removeItem?: (key: string) => Promise<void> };

export type RecoveryDeps = {
  storage: RecoveryStorage;
  createPasskey: (userName: string) => Promise<PasskeyCredential>;
  getSigner: (x: Hex, y: Hex) => Promise<Address>;
  readThreshold: (wallet: Address) => Promise<bigint>;
  readApprovals: (wallet: Address, newOwners: Address[], threshold: number) => Promise<bigint>;
  readRequest: (wallet: Address) => Promise<RecoveryRequest>;
  readOwners: (wallet: Address) => Promise<Address[]>;
  isSafeDeployed: (safe: Address) => Promise<boolean>;
  sendPasskeyUserOp: (args: PasskeyUserOpArgs) => Promise<{ userOpHash: Hex; txHash: Hex }>;
  /** Unix seconds. */
  now?: () => number;
};

const nowSec = (deps: RecoveryDeps) => (deps.now ? deps.now() : Math.floor(Date.now() / 1000));
const errName = (e: unknown) => (e as { name?: string } | null)?.name;
const detailOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function loadRecoveryState(storage: RecoveryStorage): Promise<RecoveryState | null> {
  const raw = await storage.getItem(RECOVERY_STORE_KEY);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as RecoveryState;
    if (!s?.step || !s.wallet) return null;
    return s;
  } catch {
    return null;
  }
}

export async function saveRecoveryState(storage: RecoveryStorage, s: RecoveryState): Promise<void> {
  await storage.setItem(RECOVERY_STORE_KEY, JSON.stringify(s));
}

export async function clearRecoveryState(storage: RecoveryStorage): Promise<void> {
  if (storage.removeItem) await storage.removeItem(RECOVERY_STORE_KEY);
  else await storage.setItem(RECOVERY_STORE_KEY, '');
}

async function persist(deps: RecoveryDeps, s: RecoveryState): Promise<RecoveryState> {
  await saveRecoveryState(deps.storage, s);
  return s;
}

/** A recovering person's ops always come from this phone's passkey Safe, never the wallet. */
function opBase(s: RecoveryState): Pick<PasskeyUserOpArgs, 'credentialId' | 'x' | 'y' | 'recoveryLegacy'> {
  if (!s.credentialId || !s.x || !s.y) throw new Error('recovery state has no passkey');
  return { credentialId: s.credentialId, x: s.x, y: s.y, ...(s.recoveryLegacy ? { recoveryLegacy: s.recoveryLegacy } : {}) };
}

/**
 * Step 1. Creates the passkey + resolves its signer. A cancelled sheet returns `idle` and
 * persists nothing; an unsupported device returns `error` (not persisted either).
 */
export async function startRecovery(
  args: { wallet: Address; name: string; recoveryLegacy?: Address | null },
  deps: RecoveryDeps,
): Promise<RecoveryState> {
  const base: RecoveryState = {
    step: 'creatingPasskey',
    wallet: getAddress(args.wallet),
    recoveryLegacy: args.recoveryLegacy ? getAddress(args.recoveryLegacy) : null,
    name: args.name,
  };
  let cred: PasskeyCredential;
  try {
    cred = await deps.createPasskey(args.name);
  } catch (e) {
    if (errName(e) === 'PasskeyCancelledError') {
      return { ...base, step: 'idle', message: 'Abgebrochen. Du kannst es jederzeit erneut versuchen.' };
    }
    if (errName(e) === 'PasskeyNotSupportedError') {
      return { ...base, step: 'error', message: 'Dieses Gerät unterstützt keine Passkeys.', detail: detailOf(e) };
    }
    return { ...base, step: 'error', message: 'Der Fingerabdruck konnte nicht eingerichtet werden.', detail: detailOf(e) };
  }
  const withKey: RecoveryState = {
    ...base,
    credentialId: cred.credentialId,
    x: cred.x,
    y: cred.y,
    newSafe: predictSafeAddress({ x: cred.x, y: cred.y }),
  };
  let signer: Address;
  try {
    signer = await deps.getSigner(cred.x, cred.y);
  } catch (e) {
    // The passkey exists: persist it so a retry reuses it instead of creating a second one.
    return persist(deps, { ...withKey, step: 'error', message: 'Keine Verbindung. Bitte versuche es erneut.', detail: detailOf(e) });
  }
  return persist(deps, { ...withKey, signer, step: 'waitingForGuardians' });
}

/** Retries a persisted `error` state from the right step (the signer may still be missing). */
export async function resumeRecovery(s: RecoveryState, deps: RecoveryDeps): Promise<RecoveryState> {
  if (s.step !== 'error') return s;
  if (!s.credentialId || !s.x || !s.y) return { ...s, step: 'idle' };
  if (!s.signer) {
    try {
      const signer = await deps.getSigner(s.x, s.y);
      return persist(deps, { ...s, signer, step: 'waitingForGuardians', message: undefined, detail: undefined });
    } catch (e) {
      return { ...s, message: 'Keine Verbindung. Bitte versuche es erneut.', detail: detailOf(e) };
    }
  }
  const back: RecoveryStep = s.executeAfter ? 'waitingDelay' : 'waitingForGuardians';
  return persist(deps, { ...s, step: back, message: undefined, detail: undefined });
}

const ownsOnly = (owners: readonly Address[], signer: Address) => owners.length === 1 && isAddressEqual(owners[0], signer);

/**
 * One poll tick (call every few seconds while the screen is open, and on resume). Reads chain
 * state and moves on when something happened. Never submits an op itself — the screen calls
 * `executeRecoveryStep` / `finalizeRecoveryStep` when the returned step says so.
 */
export async function pollRecovery(s: RecoveryState, deps: RecoveryDeps): Promise<RecoveryState> {
  if (!s.signer) return s;
  const signer = s.signer;
  try {
    if (s.step === 'waitingForGuardians') {
      const req = await deps.readRequest(s.wallet);
      if (req.executeAfter > 0n) {
        if (ownsOnly(req.newOwners, signer)) {
          return persist(deps, { ...s, step: 'waitingDelay', executeAfter: Number(req.executeAfter) });
        }
        return {
          ...s,
          message: 'Für dieses Konto läuft gerade eine andere Wiederherstellung. Bitte warte, bis sie vorbei ist.',
        };
      }
      const [approvals, threshold] = await Promise.all([
        deps.readApprovals(s.wallet, [signer], 1),
        deps.readThreshold(s.wallet),
      ]);
      const next: RecoveryState = { ...s, approvals: Number(approvals), threshold: Number(threshold), message: undefined };
      if (threshold > 0n && approvals >= threshold) return persist(deps, { ...next, step: 'executing' });
      if (next.approvals !== s.approvals || next.threshold !== s.threshold) return persist(deps, next);
      return next;
    }
    if (s.step === 'waitingDelay' || s.step === 'finalizing') {
      const req = await deps.readRequest(s.wallet);
      if (req.executeAfter === 0n || !ownsOnly(req.newOwners, signer)) {
        const owners = await deps.readOwners(s.wallet);
        if (ownsOnly(owners, signer)) return completeRecovery(s, deps);
        return persist(deps, {
          ...s,
          step: 'cancelled',
          message: 'Die Wiederherstellung wurde abgebrochen. Wenn du das nicht warst, sprich mit deinen Vertrauenspersonen.',
        });
      }
      const executeAfter = Number(req.executeAfter);
      if (s.step === 'waitingDelay' && nowSec(deps) >= executeAfter) {
        return persist(deps, { ...s, executeAfter, step: 'finalizing' });
      }
      return executeAfter !== s.executeAfter ? persist(deps, { ...s, executeAfter }) : s;
    }
  } catch (e) {
    // A read failure is transient: stay where we are, surface a soft message.
    return { ...s, message: 'Keine Verbindung. Wir versuchen es gleich noch einmal.', detail: detailOf(e) };
  }
  return s;
}

/** Step 3: the fingerprint-signed executeRecovery op (starts the 3-day delay). */
export async function executeRecoveryStep(s: RecoveryState, deps: RecoveryDeps): Promise<RecoveryState> {
  if (s.step !== 'executing' || !s.signer || !s.x || !s.y || !s.newSafe) return s;
  try {
    const deployed = await deps.isSafeDeployed(s.newSafe);
    await deps.sendPasskeyUserOp({
      ...opBase(s),
      calls: [encodeCreateSigner(s.x, s.y), encodeExecuteRecovery(s.wallet, [s.signer], 1)],
      deployed,
    });
  } catch (e) {
    if (errName(e) === 'PasskeyCancelledError') {
      return { ...s, message: 'Abgebrochen. Tippe erneut, wenn du bereit bist.' };
    }
    // Maybe it landed anyway (receipt timeout) — the next poll of waitingDelay will tell.
    const req = await deps.readRequest(s.wallet).catch(() => null);
    if (req && req.executeAfter > 0n && ownsOnly(req.newOwners, s.signer)) {
      return persist(deps, { ...s, step: 'waitingDelay', executeAfter: Number(req.executeAfter), message: undefined });
    }
    return { ...s, message: 'Das hat nicht geklappt. Bitte versuche es erneut.', detail: detailOf(e) };
  }
  const req = await deps.readRequest(s.wallet).catch(() => null);
  const executeAfter = req && req.executeAfter > 0n ? Number(req.executeAfter) : undefined;
  return persist(deps, { ...s, step: 'waitingDelay', executeAfter, message: undefined, detail: undefined });
}

/** Step 5: finalizeRecovery once the delay is over, then the device operates the recovered Safe. */
export async function finalizeRecoveryStep(s: RecoveryState, deps: RecoveryDeps): Promise<RecoveryState> {
  if (s.step !== 'finalizing' || !s.signer) return s;
  if (s.executeAfter && nowSec(deps) < s.executeAfter) return persist(deps, { ...s, step: 'waitingDelay' });
  try {
    await deps.sendPasskeyUserOp({ ...opBase(s), calls: [encodeFinalizeRecovery(s.wallet)], deployed: true });
  } catch (e) {
    if (errName(e) === 'PasskeyCancelledError') return { ...s, message: 'Abgebrochen. Tippe erneut, wenn du bereit bist.' };
    const owners = await deps.readOwners(s.wallet).catch(() => [] as Address[]);
    if (ownsOnly(owners, s.signer)) return completeRecovery(s, deps);
    return { ...s, message: 'Das hat nicht geklappt. Bitte versuche es erneut.', detail: detailOf(e) };
  }
  return completeRecovery(s, deps);
}

async function completeRecovery(s: RecoveryState, deps: RecoveryDeps): Promise<RecoveryState> {
  if (!s.credentialId || !s.x || !s.y || !s.signer) return s;
  await saveRecoveredRecord(deps.storage, {
    credentialId: s.credentialId,
    x: s.x,
    y: s.y,
    safe: s.wallet,
    owner: s.signer,
    ...(s.recoveryLegacy ? { legacy: s.recoveryLegacy } : {}),
  });
  return persist(deps, { ...s, step: 'done', message: undefined, detail: undefined });
}

/** "Noch 2 Tage, 14 Stunden" (minutes only in the last hour). */
export function formatRemaining(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s === 0) return 'Gleich geschafft';
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.ceil((s % 3600) / 60);
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  if (days > 0) return `Noch ${plural(days, 'Tag', 'Tage')}, ${plural(hours, 'Stunde', 'Stunden')}`;
  if (hours > 0) return `Noch ${plural(hours, 'Stunde', 'Stunden')}`;
  return `Noch ${plural(minutes, 'Minute', 'Minuten')}`;
}

/** The pending request is someone ELSE's recovery of my Safe (the owner must be warned). */
export function isForeignRecoveryPending(req: RecoveryRequest | null, myOwner: Address): boolean {
  if (!req || req.executeAfter === 0n) return false;
  return !req.newOwners.some((o) => isAddressEqual(o, myOwner));
}
