/**
 * Passkey migration (tranche 1) — the state machine behind Settings → "Passkey & Wiederherstellung".
 *
 *   idle → creatingPasskey → rewrappingSecrets → signingHandover → submitting → done | error
 *
 * The user's thirdweb smart account stays THE account. The passkey Safe is only added as a
 * co-admin (`setPermissionsForSigner`, isAdmin 1), signed by the thirdweb admin EOA and submitted
 * by the Safe itself in one sponsored userOp. Nothing is removed; tranche 1 never builds an
 * isAdmin 2 request.
 *
 * Every side effect is injected (`MigrationDeps`) so the flow is unit-tested without native code;
 * `migration-runtime.ts` wires the real library, SecureStore and a Gnosis public client.
 *
 * A legacy account that is COUNTERFACTUAL on Gnosis (never deployed) is deployed in the same op:
 * [AccountFactory.createAccount(adminEoa, 0x), handover] (needs `needsLegacyDeploy` + `adminAddress`).
 *
 * The record persists the Safe address AND its owner (review L4): after a guardian recovery the
 * owner is the new passkey's per-key SafeWebAuthnSignerFactory signer and the Safe address is no
 * longer derivable from the key, so every later userOp uses `sender: rec.safe, owner: rec.owner`.
 *
 * Persistence: `passkey_migration_v1` is written only AFTER passkey creation succeeded, so a
 * cancelled or unsupported passkey sheet leaves no trace. A persisted credential is reused on the
 * next run (never a second passkey). The MACI / Nostr originals are never touched — the wrapped
 * copies go to their own keys.
 */
import type { Address, Hex, TypedDataDefinition } from 'viem';
import { isAddressEqual } from 'viem';
import { SAFE_WEBAUTHN_SHARED_SIGNER } from './constants';
import {
  buildAddAdminRequest,
  encodeSetPermissions,
  signerPermissionTypedData,
  type SignerPermissionRequest,
} from './legacy-handover';
import { buildCreateLegacyAccountCall } from './migration-v3';
import { predictSafeAddress } from './safe-address';
import type { PasskeyUserOpArgs, SponsoredCall } from './userop';
import type { PasskeyCredential } from './webauthn';

export const MIGRATION_STORE_KEY = 'passkey_migration_v1';
export const WRAPPED_MACI_KEY = 'passkey_wrapped_maci_v1';
export const WRAPPED_NOSTR_KEY = 'passkey_wrapped_nostr_v1';
/** HKDF salts (labels) for the PRF vault — one per secret so blobs cannot be swapped. */
export const MACI_WRAP_LABEL = 'roebel/maci-keypair/v1';
export const NOSTR_WRAP_LABEL = 'roebel/nostr-secret/v1';

export type MigrationStep =
  | 'idle'
  | 'creatingPasskey'
  | 'rewrappingSecrets'
  | 'signingHandover'
  | 'submitting'
  | 'done'
  | 'error';

/** 'done' = secrets wrapped under the passkey PRF; 'skipped' = PRF unavailable, NOT passkey-protected. */
export type RewrapStatus = 'done' | 'skipped';

/**
 * How the passkey signs for the Safe: through the SafeWebAuthnSharedSigner (a Safe created with
 * this passkey) or through its own SafeWebAuthnSignerFactory signer (a Safe recovered to it).
 */
export type SafeOwnerType = 'sharedSigner' | 'webauthnSigner';

export type MigrationRecord = {
  credentialId: string;
  x: Hex;
  y: Hex;
  safe: Address;
  /** Absent in records written before 2026-09-26: read them as 'sharedSigner'. */
  ownerType: SafeOwnerType;
  /** The Safe owner userOp / ERC-1271 signatures name (SharedSigner or the per-key signer). */
  owner: Address;
  /** The thirdweb smart account this passkey Safe was created for (unknown after a recovery on a new device). */
  legacy?: Address;
  status: 'passkeyCreated' | 'done';
  rewrap?: RewrapStatus;
  txHash?: Hex | null;
};

export type MigrationProgress = { step: MigrationStep; rewrap?: RewrapStatus };

export type MigrationResult =
  | { status: 'done'; safe: Address; rewrap: RewrapStatus; txHash: Hex | null; alreadyAdmin: boolean }
  | { status: 'idle'; reason: 'cancelled' | 'notSupported'; message: string }
  | { status: 'error'; message: string; detail: string };

export type KeyValueStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

export type MigrationDeps = {
  storage: KeyValueStorage;
  createPasskey: (userName: string) => Promise<PasskeyCredential>;
  getPrfSecret: (credentialId: string) => Promise<Hex | null>;
  wrapSecret: (prf: Hex, label: string, secret: Uint8Array) => Promise<string>;
  /** The persisted MACI keypair (as stored), or null. Must never re-derive. */
  readMaciSecret: () => Promise<Uint8Array | null>;
  /** The persisted Nostr secret key, or null. Must never re-derive. */
  readNostrSecret: () => Promise<Uint8Array | null>;
  /** `legacy.isAdmin(safe)` on Gnosis. */
  readIsAdmin: (legacy: Address, safe: Address) => Promise<boolean>;
  /** EIP-712 signature by the thirdweb ADMIN EOA (not the smart account — 1271 would fail). */
  signTypedData: (typed: TypedDataDefinition<any, any>) => Promise<Hex>;
  isSafeDeployed: (safe: Address) => Promise<boolean>;
  /** `legacy` passes the citizen's legacy account: the sponsor binds the op to it. */
  sendPasskeyUserOp: (args: PasskeyUserOpArgs) => Promise<{ userOpHash: Hex; txHash: Hex }>;
  /** true when the legacy account is counterfactual on Gnosis (then it is deployed in the handover op). */
  needsLegacyDeploy?: (legacy: Address) => Promise<boolean>;
  /** The thirdweb admin EOA address (the `createAccount` admin for a counterfactual legacy account). */
  adminAddress?: () => Promise<Address>;
  now?: () => number;
};

export async function loadMigrationRecord(storage: KeyValueStorage): Promise<MigrationRecord | null> {
  const raw = await storage.getItem(MIGRATION_STORE_KEY);
  if (!raw) return null;
  try {
    const rec = JSON.parse(raw) as Partial<MigrationRecord>;
    if (!rec?.credentialId || !rec.x || !rec.y || !rec.safe) return null;
    // Records from before owner persistence were all created with the SharedSigner.
    if (rec.ownerType !== 'webauthnSigner') {
      return { ...rec, ownerType: 'sharedSigner', owner: SAFE_WEBAUTHN_SHARED_SIGNER } as MigrationRecord;
    }
    return rec.owner ? (rec as MigrationRecord) : null;
  } catch {
    return null;
  }
}

async function saveRecord(storage: KeyValueStorage, rec: MigrationRecord): Promise<void> {
  await storage.setItem(MIGRATION_STORE_KEY, JSON.stringify(rec));
}

/**
 * Persists a Safe recovered to this device's passkey (after `finalizeRecovery`): the address is the
 * OLD Safe, the owner is `readWebAuthnSigner(x, y)`. Replaces any record on this device.
 */
export async function saveRecoveredRecord(
  storage: KeyValueStorage,
  rec: { credentialId: string; x: Hex; y: Hex; safe: Address; owner: Address; legacy?: Address },
): Promise<MigrationRecord> {
  const full: MigrationRecord = { ...rec, ownerType: 'webauthnSigner', status: 'done', txHash: null };
  await saveRecord(storage, full);
  return full;
}

/** `sendPasskeyUserOp` sender/owner/deployed for a persisted record. */
export function userOpTargetFor(rec: MigrationRecord): { sender: Address; owner: Address } {
  return { sender: rec.safe, owner: rec.owner };
}

const SAVE_FAILED_MESSAGE =
  'Der Passkey-Status konnte auf diesem Gerät nicht gespeichert werden. Bitte versuche es erneut.';
const SAVE_FAILED_AFTER_DONE_MESSAGE =
  'Dein Passkey ist verbunden, aber der Status konnte auf diesem Gerät nicht gespeichert werden. Öffne die Seite erneut.';

/** saveRecord that never throws: a SecureStore failure becomes an error result (null = saved). */
async function trySaveRecord(
  storage: KeyValueStorage,
  rec: MigrationRecord,
  message = SAVE_FAILED_MESSAGE,
): Promise<MigrationResult | null> {
  try {
    await saveRecord(storage, rec);
    return null;
  } catch (e) {
    return { status: 'error', message, detail: e instanceof Error ? e.message : String(e) };
  }
}

function errorName(e: unknown): string | undefined {
  return (e as { name?: string } | null)?.name;
}

const CANCELLED_MESSAGE = 'Vorgang abgebrochen. Du kannst es jederzeit erneut versuchen.';
const NOT_SUPPORTED_MESSAGE =
  'Dieses Gerät unterstützt keine Passkeys. Deine E-Mail-Anmeldung funktioniert weiterhin.';

function idleOrError(e: unknown, fallback: string): MigrationResult {
  if (errorName(e) === 'PasskeyCancelledError') return { status: 'idle', reason: 'cancelled', message: CANCELLED_MESSAGE };
  if (errorName(e) === 'PasskeyNotSupportedError')
    return { status: 'idle', reason: 'notSupported', message: NOT_SUPPORTED_MESSAGE };
  return { status: 'error', message: fallback, detail: e instanceof Error ? e.message : String(e) };
}

function isCancelOrUnsupported(e: unknown): boolean {
  const n = errorName(e);
  return n === 'PasskeyCancelledError' || n === 'PasskeyNotSupportedError';
}

/** Sanity guard: tranche 1 must never sign or submit anything but an add-admin request. */
function assertAddAdmin(req: SignerPermissionRequest, safe: Address): void {
  if (req.isAdmin !== 1 || !isAddressEqual(req.signer, safe)) {
    throw new Error('refusing to sign a non add-admin permission request');
  }
}

export async function runPasskeyMigration(
  args: { legacy: Address; userName: string },
  deps: MigrationDeps,
  onProgress?: (p: MigrationProgress) => void,
): Promise<MigrationResult> {
  const { legacy } = args;
  const report = (step: MigrationStep, rewrap?: RewrapStatus) => onProgress?.({ step, rewrap });

  // 1. passkey (or resume the persisted one)
  report('creatingPasskey');
  let rec: MigrationRecord | null;
  try {
    rec = await loadMigrationRecord(deps.storage);
  } catch (e) {
    report('error');
    return idleOrError(e, 'Der gespeicherte Passkey-Status konnte nicht gelesen werden.');
  }
  if (rec && rec.legacy && !isAddressEqual(rec.legacy, legacy)) {
    report('error');
    return {
      status: 'error',
      message: 'Auf diesem Gerät ist bereits ein Passkey-Konto für ein anderes Konto eingerichtet.',
      detail: 'persisted passkey record belongs to a different legacy account',
    };
  }
  if (!rec) {
    let cred: PasskeyCredential;
    try {
      cred = await deps.createPasskey(args.userName);
    } catch (e) {
      const res = idleOrError(e, 'Der Passkey konnte nicht erstellt werden.');
      report(res.status === 'idle' ? 'idle' : 'error');
      return res;
    }
    const safe = predictSafeAddress({ x: cred.x, y: cred.y });
    rec = {
      credentialId: cred.credentialId,
      x: cred.x,
      y: cred.y,
      safe,
      ownerType: 'sharedSigner',
      owner: SAFE_WEBAUTHN_SHARED_SIGNER,
      legacy,
      status: 'passkeyCreated',
    };
    const saveErr = await trySaveRecord(deps.storage, rec);
    if (saveErr) {
      report('error');
      return saveErr;
    }
  }
  const current: MigrationRecord = rec;
  const safe = current.safe;

  // 2. secrets re-wrap under the passkey PRF (once)
  report('rewrappingSecrets');
  if (!current.rewrap) {
    try {
      current.rewrap = await rewrapSecrets(current.credentialId, deps);
    } catch (e) {
      if (isCancelOrUnsupported(e)) {
        const res = idleOrError(e, '');
        report('idle');
        return res;
      }
      report('error');
      return idleOrError(e, 'Deine Schlüssel konnten nicht geschützt werden.');
    }
    const saveErr = await trySaveRecord(deps.storage, current);
    if (saveErr) {
      report('error', current.rewrap);
      return saveErr;
    }
  }
  const rewrap = current.rewrap;

  // 3. idempotence + admin EOA signature
  report('signingHandover', rewrap);
  let alreadyAdmin: boolean;
  let deployLegacyAdmin: Address | null = null;
  try {
    // A counterfactual legacy account has no admins yet: deploy it in the handover op.
    if (deps.needsLegacyDeploy && (await deps.needsLegacyDeploy(legacy))) {
      if (!deps.adminAddress) throw new Error('legacy account is not deployed and no admin address is available');
      deployLegacyAdmin = await deps.adminAddress();
      alreadyAdmin = false;
    } else {
      alreadyAdmin = await deps.readIsAdmin(legacy, safe);
    }
  } catch (e) {
    report('error', rewrap);
    return idleOrError(e, 'Der Kontostatus konnte nicht gelesen werden. Bitte prüfe deine Verbindung.');
  }
  if (alreadyAdmin) {
    const done: MigrationRecord = { ...current, status: 'done', txHash: current.txHash ?? null };
    const saveErr = await trySaveRecord(deps.storage, done, SAVE_FAILED_AFTER_DONE_MESSAGE);
    if (saveErr) {
      report('error', rewrap);
      return saveErr;
    }
    report('done', rewrap);
    return { status: 'done', safe, rewrap, txHash: done.txHash ?? null, alreadyAdmin: true };
  }

  let req: SignerPermissionRequest;
  let sig: Hex;
  try {
    req = buildAddAdminRequest(safe, (deps.now ?? (() => Date.now() / 1000))());
    assertAddAdmin(req, safe);
    sig = await deps.signTypedData(signerPermissionTypedData(legacy, req));
  } catch (e) {
    report('error', rewrap);
    return idleOrError(e, 'Die Freigabe durch dein Konto ist fehlgeschlagen.');
  }

  // 4. one sponsored userOp from the passkey Safe: legacy.setPermissionsForSigner(req, sig)
  report('submitting', rewrap);
  let txHash: Hex;
  try {
    const deployed = await deps.isSafeDeployed(safe);
    const call: SponsoredCall = { to: legacy, data: encodeSetPermissions(req, sig) };
    const calls = deployLegacyAdmin ? [buildCreateLegacyAccountCall(deployLegacyAdmin), call] : [call];
    ({ txHash } = await deps.sendPasskeyUserOp({
      credentialId: current.credentialId,
      x: current.x,
      y: current.y,
      legacy,
      calls,
      deployed,
      sender: current.safe,
      owner: current.owner,
    }));
  } catch (e) {
    const res = idleOrError(e, 'Das Passkey-Konto konnte nicht verbunden werden. Bitte versuche es erneut.');
    report(res.status === 'idle' ? 'idle' : 'error', rewrap);
    return res;
  }

  const saveErr = await trySaveRecord(deps.storage, { ...current, status: 'done', txHash }, SAVE_FAILED_AFTER_DONE_MESSAGE);
  if (saveErr) {
    report('error', rewrap);
    return saveErr;
  }
  report('done', rewrap);
  return { status: 'done', safe, rewrap, txHash, alreadyAdmin: false };
}

/**
 * PRF → wrap the persisted MACI keypair and Nostr secret. A missing PRF is NEVER replaced by a
 * derived key: the re-wrap is skipped and reported as not passkey-protected.
 */
async function rewrapSecrets(credentialId: string, deps: MigrationDeps): Promise<RewrapStatus> {
  let prf: Hex | null;
  try {
    prf = await deps.getPrfSecret(credentialId);
  } catch (e) {
    // A cancelled prompt aborts the run (resumable); any other PRF failure counts as "no PRF".
    if (isCancelOrUnsupported(e)) throw e;
    prf = null;
  }
  if (!prf) return 'skipped';
  const [maci, nostr] = await Promise.all([deps.readMaciSecret(), deps.readNostrSecret()]);
  if (maci && maci.length > 0) {
    await deps.storage.setItem(WRAPPED_MACI_KEY, await deps.wrapSecret(prf, MACI_WRAP_LABEL, maci));
  }
  if (nostr && nostr.length > 0) {
    await deps.storage.setItem(WRAPPED_NOSTR_KEY, await deps.wrapSecret(prf, NOSTR_WRAP_LABEL, nostr));
  }
  return 'done';
}
