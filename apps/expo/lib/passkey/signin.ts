/**
 * "Unabhängiges Konto": sign-in and sign-up with a passkey, no thirdweb.
 *
 * Sign-in (existing passkey, any device where it is synced):
 *   1. discoverable WebAuthn get (no allowCredentials, rpId id.ortis.app) over a random challenge;
 *   2. credential → public key (x, y):
 *        - a local record with that credential id (`passkey_migration_v1` / `passkey_session_v1`)
 *          gives x, y, the Safe and its owner directly;
 *        - otherwise the key is RECOVERED from the P-256 signature (a `get` never returns the
 *          public key, and the key cannot be stored in the userHandle at creation because it
 *          does not exist yet). Recovery gives two candidates; the one whose passkey Safe is known
 *          (deployed, admin of a legacy account, or has a users row) wins. When neither is known
 *          (a brand-new counterfactual account on a second device), a second assertion with the
 *          same credential decides (the intersection of both candidate sets is the key);
 *   3. Safe → identity (`resolveIdentity`): the Safe after a v3 moveTo, else its linked legacy
 *      thirdweb account (AdminUpdated events, re-checked with isAdmin), else the Safe itself.
 *
 * Sign-up ("Neues unabhängiges Konto erstellen"): createPasskey → counterfactual Safe
 * (standalone record, SocialRecoveryModule enabled at setup) → identity = the Safe.
 *
 * Either way the result is a `PasskeySession` that is persisted (`passkey_session_v1`) and
 * connected as the thirdweb adapter wallet. Every side effect is injected.
 */
import { bytesToHex, getAddress, isAddressEqual, type Address, type Hex } from 'viem';
import { SAFE_WEBAUTHN_SHARED_SIGNER } from './constants';
import { MIGRATION_STORE_KEY, loadMigrationRecord, type KeyValueStorage, type MigrationRecord } from './migration';
import { intersectKeys, recoverP256PublicKeys, type P256Point } from './p256-recover';
import { predictSafeAddress } from './safe-address';
import { loadPasskeySession, savePasskeySession, type PasskeySession, type SessionStorage } from './session';
import { ensureStandalonePasskey } from './standalone';
import { webAuthnSigningDigest } from './userop';
import type { DiscoverableAssertion, PasskeyAssertion, PasskeyCredential } from './webauthn';

export type IdentityChain = {
  /** Legacy thirdweb accounts the Safe administers right now (recovery-lookup `findLinkedLegacies`). */
  findLinkedLegacies: (safe: Address) => Promise<Address[]>;
  /** CitizenNFTv2.hasCitizenNFT — picks the right legacy account when a Safe administers several. */
  holdsCitizenV2: (account: Address) => Promise<boolean>;
  /** CitizenNFTv3.hasCitizenNFT (false when v3 is not configured): true = the Safe itself moved. */
  holdsCitizenV3: (account: Address) => Promise<boolean>;
};

export type ResolvedIdentity = { identity: Address; kind: 'legacy' | 'safe' | 'moved' };

/** Safe → the address the app runs as. */
export async function resolveIdentity(safe: Address, chain: IdentityChain): Promise<ResolvedIdentity> {
  const s = getAddress(safe);
  if (await chain.holdsCitizenV3(s).catch(() => false)) return { identity: s, kind: 'moved' };
  const legacies = await chain.findLinkedLegacies(s);
  if (legacies.length === 0) return { identity: s, kind: 'safe' };
  if (legacies.length === 1) return { identity: getAddress(legacies[0]), kind: 'legacy' };
  const citizens: Address[] = [];
  for (const l of legacies) if (await chain.holdsCitizenV2(l).catch(() => false)) citizens.push(l);
  return { identity: getAddress((citizens[0] ?? legacies[0]) as Address), kind: 'legacy' };
}

// ---------------------------------------------------------------------------
// Credential → key
// ---------------------------------------------------------------------------

export type ResolvedKey = { x: Hex; y: Hex; safe: Address; owner: Address; ownerType: MigrationRecord['ownerType'] };

export type KeyChain = {
  hasCode: (a: Address) => Promise<boolean>;
  findLinkedLegacies: (safe: Address) => Promise<Address[]>;
  /** A users row with this wallet exists (a passkey-only account that signed up before). */
  isKnownAccount?: (a: Address) => Promise<boolean>;
};

/** Candidate keys of one assertion (2 in practice). */
export function candidateKeys(a: Pick<PasskeyAssertion, 'authenticatorData' | 'clientDataJSON' | 'r' | 's'>): P256Point[] {
  const { digest } = webAuthnSigningDigest(a.authenticatorData, a.clientDataJSON);
  return recoverP256PublicKeys(digest, a.r, a.s);
}

const sharedSignerKey = (k: P256Point): ResolvedKey => ({
  x: k.x,
  y: k.y,
  safe: predictSafeAddress(k),
  owner: SAFE_WEBAUTHN_SHARED_SIGNER,
  ownerType: 'sharedSigner',
});

async function isKnownSafe(safe: Address, chain: KeyChain): Promise<boolean> {
  const checks = [
    chain.hasCode(safe).catch(() => false),
    chain.findLinkedLegacies(safe).then((l) => l.length > 0, () => false),
    chain.isKnownAccount ? chain.isKnownAccount(safe).catch(() => false) : Promise.resolve(false),
  ];
  return (await Promise.all(checks)).some(Boolean);
}

export class PasskeySignInError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PasskeySignInError';
  }
}

export const NO_ACCOUNT_MESSAGE =
  'Zu diesem Passkey haben wir kein Konto gefunden. Erstelle ein neues unabhängiges Konto oder nutze die Kontowiederherstellung.';

/**
 * The key (and Safe) behind a discoverable assertion. `local` = the records on this device;
 * `signAgain` = a second assertion by the same credential, used only when recovery is ambiguous.
 */
export async function resolveCredentialKey(
  assertion: DiscoverableAssertion,
  deps: {
    local: Array<Pick<MigrationRecord, 'credentialId' | 'x' | 'y' | 'safe' | 'owner' | 'ownerType'> | null>;
    chain: KeyChain;
    signAgain: (credentialId: string) => Promise<PasskeyAssertion>;
  },
): Promise<ResolvedKey> {
  const rec = deps.local.find((r) => r && r.credentialId === assertion.credentialId);
  if (rec) return { x: rec.x, y: rec.y, safe: getAddress(rec.safe), owner: getAddress(rec.owner), ownerType: rec.ownerType };

  const first = candidateKeys(assertion);
  if (first.length === 0) throw new PasskeySignInError('Die Passkey-Signatur konnte nicht gelesen werden.');
  const known: ResolvedKey[] = [];
  for (const k of first) {
    const key = sharedSignerKey(k);
    if (await isKnownSafe(key.safe, deps.chain)) known.push(key);
  }
  if (known.length === 1) return known[0];
  if (known.length > 1) throw new PasskeySignInError('Dieser Passkey passt zu mehreren Konten. Bitte wende dich an den Support.');

  // Neither Safe is known (a counterfactual account with no trace yet): ask once more.
  const second = candidateKeys(await deps.signAgain(assertion.credentialId));
  const both = intersectKeys(first, second);
  if (both.length !== 1) throw new PasskeySignInError('Die Passkey-Signatur konnte nicht eindeutig zugeordnet werden.');
  return sharedSignerKey(both[0]);
}

// ---------------------------------------------------------------------------
// Flows
// ---------------------------------------------------------------------------

export type SignInDeps = {
  migrationStorage: KeyValueStorage;
  sessionStorage: SessionStorage;
  randomChallenge: () => Hex;
  getDiscoverableAssertion: (challenge: Hex) => Promise<DiscoverableAssertion>;
  /** Assertion restricted to one credential (signWithPasskey). */
  signWithCredential: (credentialId: string, challenge: Hex) => Promise<PasskeyAssertion>;
  keyChain: KeyChain;
  identityChain: IdentityChain;
};

export type SignInResult =
  | { status: 'signedIn'; session: PasskeySession; kind: ResolvedIdentity['kind'] }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

function mapFlowError(e: unknown, fallback: string): SignInResult {
  const n = (e as { name?: string } | null)?.name;
  if (n === 'PasskeyCancelledError') return { status: 'cancelled' };
  if (n === 'PasskeyNotSupportedError') return { status: 'error', message: 'Dieses Gerät unterstützt keine Passkeys.' };
  if (e instanceof PasskeySignInError) return { status: 'error', message: e.message };
  return { status: 'error', message: fallback };
}

async function finish(key: ResolvedKey, credentialId: string, deps: SignInDeps): Promise<SignInResult> {
  const resolved = await resolveIdentity(key.safe, deps.identityChain);
  const session: PasskeySession = {
    credentialId,
    x: key.x,
    y: key.y,
    safe: key.safe,
    identity: resolved.identity,
    ownerType: key.ownerType,
    owner: key.owner,
  };
  await savePasskeySession(deps.sessionStorage, session);
  // A device that signs in with a synced passkey gets the migration record too (guardians,
  // email, recovery screens read it). An existing record is never overwritten.
  const existing = await loadMigrationRecord(deps.migrationStorage).catch(() => null);
  if (!existing) {
    const rec: MigrationRecord = {
      credentialId,
      x: key.x,
      y: key.y,
      safe: key.safe,
      ownerType: key.ownerType,
      owner: key.owner,
      ...(resolved.kind === 'legacy' ? { legacy: resolved.identity, status: 'done' as const } : { status: 'passkeyCreated' as const }),
    };
    await deps.migrationStorage.setItem(MIGRATION_STORE_KEY, JSON.stringify(rec)).catch(() => undefined);
  }
  return { status: 'signedIn', session, kind: resolved.kind };
}

/** "Mit Passkey anmelden". */
export async function signInWithPasskey(deps: SignInDeps): Promise<SignInResult> {
  try {
    const assertion = await deps.getDiscoverableAssertion(deps.randomChallenge());
    const flags = parseInt(assertion.authenticatorData.slice(2 + 64, 2 + 66), 16);
    if (!(flags & 0x04)) throw new PasskeySignInError('Der Passkey hat die Anmeldung nicht bestätigt.');
    const local = await Promise.all([
      loadMigrationRecord(deps.migrationStorage).catch(() => null),
      loadPasskeySession(deps.sessionStorage).catch(() => null),
    ]);
    const key = await resolveCredentialKey(assertion, {
      local,
      chain: deps.keyChain,
      signAgain: (id) => deps.signWithCredential(id, deps.randomChallenge()),
    });
    return await finish(key, assertion.credentialId, deps);
  } catch (e) {
    return mapFlowError(e, 'Die Anmeldung mit Passkey hat nicht geklappt. Bitte versuche es erneut.');
  }
}

/** "Neues unabhängiges Konto erstellen". Reuses this device's passkey record (never a second passkey). */
export async function signUpWithPasskey(
  userName: string,
  deps: SignInDeps & { createPasskey: (userName: string) => Promise<PasskeyCredential> },
): Promise<SignInResult> {
  try {
    const res = await ensureStandalonePasskey(userName, { storage: deps.migrationStorage, createPasskey: deps.createPasskey });
    if (res.status === 'cancelled') return { status: 'cancelled' };
    if (res.status === 'error') return { status: 'error', message: res.message };
    const rec = res.record;
    const key: ResolvedKey = { x: rec.x, y: rec.y, safe: getAddress(rec.safe), owner: rec.owner, ownerType: rec.ownerType };
    if (res.status === 'created') {
      const session: PasskeySession = { credentialId: rec.credentialId, ...key, identity: key.safe };
      await savePasskeySession(deps.sessionStorage, session);
      return { status: 'signedIn', session, kind: 'safe' };
    }
    // An existing record: a migration that is not finished must not become a Safe-only account.
    if (rec.legacy && rec.status !== 'done') {
      const linked = await deps.identityChain.findLinkedLegacies(key.safe).catch(() => [] as Address[]);
      if (!linked.some((l) => isAddressEqual(l, rec.legacy as Address))) {
        return {
          status: 'error',
          message:
            'Auf diesem Gerät ist schon ein Passkey für dein bestehendes Konto angelegt. Schließe die Einrichtung unter Einstellungen → Passkey ab.',
        };
      }
    }
    return await finish(key, rec.credentialId, deps);
  } catch (e) {
    return mapFlowError(e, 'Das Konto konnte nicht erstellt werden. Bitte versuche es erneut.');
  }
}

/**
 * Settings → "Mit Passkey anmelden" for a person who already migrated on this device: the
 * record has everything (no biometric prompt needed to switch the session). Refuses a record
 * whose handover is not on chain: the app would otherwise run as the bare Safe.
 */
export async function signInFromMigrationRecord(
  deps: Pick<SignInDeps, 'migrationStorage' | 'sessionStorage' | 'identityChain'>,
): Promise<SignInResult> {
  try {
    const rec = await loadMigrationRecord(deps.migrationStorage);
    if (!rec) return { status: 'error', message: 'Auf diesem Gerät ist noch kein Passkey eingerichtet.' };
    const key: ResolvedKey = { x: rec.x, y: rec.y, safe: getAddress(rec.safe), owner: rec.owner, ownerType: rec.ownerType };
    const resolved = await resolveIdentity(key.safe, deps.identityChain);
    if (rec.legacy && resolved.kind === 'safe') {
      return { status: 'error', message: 'Dein Passkey ist noch nicht mit deinem Konto verbunden. Schließe zuerst die Einrichtung ab.' };
    }
    const session: PasskeySession = { credentialId: rec.credentialId, ...key, identity: resolved.identity };
    await savePasskeySession(deps.sessionStorage, session);
    return { status: 'signedIn', session, kind: resolved.kind };
  } catch (e) {
    return mapFlowError(e, 'Der Wechsel zum Passkey hat nicht geklappt. Bitte prüfe deine Verbindung.');
  }
}

/** 32 random bytes as hex (the sign-in challenge; the server never sees it). */
export function randomChallengeFrom(random: (n: number) => Uint8Array): Hex {
  return bytesToHex(random(32));
}
