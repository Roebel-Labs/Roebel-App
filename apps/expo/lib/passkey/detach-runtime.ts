/**
 * Real-world wiring for the "thirdweb trennen" screen and the Settings actions around it
 * ("Schlüssel sichern", "Nachrichten auf Passkey übertragen", the passkey test action).
 * Load lazily (native passkey code); only the preview-gated settings screens import it.
 */
import { createPublicClient, http, type Address, type Hex, type TypedDataDefinition } from 'viem';
import { encodeChangeThreshold } from './guardians';
import { readGuardianState } from './guardians-runtime';
import { loadMigrationRecord, type MigrationRecord } from './migration';
import { secureKeyValueStorage } from './migration-runtime';
import { markSponsoredOpSucceeded, runDetach, type DetachResult } from './detach';
import { backupKeysForSession, deviceSecretSources, readBackupStatus } from './derived-keys-runtime';
import type { KeyBackupSlot } from './key-backup';
import type { PasskeySession } from './session';
import { DEFAULT_GNOSIS_RPC_URL, isSafeDeployed, sendPasskeyUserOp, type PasskeyUserOpArgs } from './userop';

const gnosisClient = createPublicClient({ transport: http(DEFAULT_GNOSIS_RPC_URL, { timeout: 15_000, retryCount: 1 }) });

const adminsAbi = [
  { type: 'function', name: 'getAllAdmins', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address[]' }] },
  { type: 'function', name: 'isAdmin', stateMutability: 'view', inputs: [{ name: '_account', type: 'address' }], outputs: [{ name: '', type: 'bool' }] },
] as const;

export const readAllAdmins = (legacy: Address) =>
  gnosisClient.readContract({ address: legacy, abi: adminsAbi, functionName: 'getAllAdmins' }) as Promise<readonly Address[]>;
export const readIsAdmin = (legacy: Address, signer: Address) =>
  gnosisClient.readContract({ address: legacy, abi: adminsAbi, functionName: 'isAdmin', args: [signer] }) as Promise<boolean>;

/**
 * The passkey session to act with from Settings: the active adapter session, or — under a
 * thirdweb session — one built from this device's migration record (identity = the legacy account).
 */
export async function actingPasskeySession(activeSession: PasskeySession | null, identity: Address | undefined): Promise<PasskeySession | null> {
  if (activeSession) return activeSession;
  const rec: MigrationRecord | null = await loadMigrationRecord(secureKeyValueStorage).catch(() => null);
  if (!rec || rec.status !== 'done') return null;
  const legacy = rec.legacy ?? identity;
  if (!legacy) return null;
  return { credentialId: rec.credentialId, x: rec.x, y: rec.y, safe: rec.safe, identity: legacy, ownerType: rec.ownerType, owner: rec.owner };
}

function sendAs(session: PasskeySession) {
  return async (args: Pick<PasskeyUserOpArgs, 'legacy' | 'calls'>) => {
    const res = await sendPasskeyUserOp({
      credentialId: session.credentialId,
      x: session.x,
      y: session.y,
      ...(args.legacy ? { legacy: args.legacy } : {}),
      calls: args.calls,
      deployed: await isSafeDeployed(session.safe),
      sender: session.safe,
      owner: session.owner,
    });
    markSponsoredOpSucceeded();
    return res;
  };
}

export async function guardianCounts(safe: Address): Promise<{ count: number; threshold: number }> {
  const s = await readGuardianState(safe);
  return { count: s.guardians.length, threshold: s.threshold };
}

/**
 * Checklist item (4): a sponsored no-op from the passkey Safe — `SRM.changeThreshold(current)` —
 * through the legacy mode of the sponsor (Safe = admin of the legacy account). Proves passkey
 * signing, sponsoring and execution without changing anything. Needs >= 1 guardian.
 */
export async function runPasskeyTestAction(session: PasskeySession): Promise<Hex> {
  const { count, threshold } = await guardianCounts(session.safe);
  if (count < 1 || threshold < 1) throw new Error('Füge zuerst Vertrauenspersonen hinzu.');
  const legacy = session.identity.toLowerCase() === session.safe.toLowerCase() ? undefined : session.identity;
  const { txHash } = await sendAs(session)({ ...(legacy ? { legacy } : {}), calls: [encodeChangeThreshold(threshold)] });
  return txHash;
}

/** Checklist item (5): which slots this device holds vs. which the server backup has (null = off/unreachable). */
export async function keyBackupState(session: PasskeySession): Promise<{ local: KeyBackupSlot[]; backup: KeyBackupSlot[] | null }> {
  const local: KeyBackupSlot[] = [];
  for (const s of deviceSecretSources(session.identity)) if (await s.loadLocal()) local.push(s.slot);
  const r = await readBackupStatus(session).catch(() => ({ status: 'disabled' as const }));
  return { local, backup: r.status === 'ok' ? r.slots : null };
}

export { backupKeysForSession };

/** The detach itself. `signTypedDataAsEoa` = the thirdweb admin EOA's EIP-712 signer. */
export function detachThirdweb(p: {
  session: PasskeySession;
  eoa: Address;
  signTypedDataAsEoa: (typed: TypedDataDefinition<any, any>) => Promise<Hex>;
}): Promise<DetachResult> {
  return runDetach({
    legacy: p.session.identity,
    safe: p.session.safe,
    eoa: p.eoa,
    getAllAdmins: readAllAdmins,
    isAdmin: readIsAdmin,
    readGuardianState: guardianCounts,
    signTypedDataAsEoa: p.signTypedDataAsEoa,
    sendUserOp: sendAs(p.session),
  });
}
