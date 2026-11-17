jest.mock('react-native-passkey', () => ({ Passkey: { create: jest.fn(), get: jest.fn(), isSupported: () => true } }));

import { getAddress, isAddressEqual, type Address, type Hex } from 'viem';
import { SAFE_WEBAUTHN_SHARED_SIGNER } from '../constants';
import { MIGRATION_STORE_KEY, loadMigrationRecord } from '../migration';
import { createLookupChain, findSafesByOwner } from '../recovery-lookup';
import { predictSafeAddress } from '../safe-address';
import { PASSKEY_SESSION_KEY, loadPasskeySession } from '../session';
import {
  PasskeySignInError,
  resolveCredentialKey,
  resolveIdentity,
  signInFromMigrationRecord,
  signInWithPasskey,
  signUpWithPasskey,
  type IdentityChain,
  type KeyChain,
  type SignInDeps,
} from '../signin';
import { internalRpcError, shapeClient } from '../__testutils__/lookup-client';
import { assertionFor, mem, newTestPasskey, type TestPasskey } from '../__testutils__/signin-helpers';

const LEGACY = getAddress('0xc49dE63CcfeE46C6C5c3E393293f66779799Fb28');
const LEGACY2 = getAddress('0x00000000000000000000000000000000000000aa');
const SIGNER = getAddress('0x00000000000000000000000000000000000051a1');
const OTHER_SIGNER = getAddress('0x00000000000000000000000000000000000051a2');
const NO_SIGNER = getAddress('0x00000000000000000000000000000000000051a0');
const RECOVERED = getAddress('0x000000000000000000000000000000000000ec0e');

function identityChain(p: { links?: Record<string, Address[]>; v2?: Address[]; v3?: Address[] } = {}): IdentityChain {
  return {
    findLinkedLegacies: async (safe) => p.links?.[safe.toLowerCase()] ?? [],
    holdsCitizenV2: async (a) => (p.v2 ?? []).some((x) => isAddressEqual(x, a)),
    holdsCitizenV3: async (a) => (p.v3 ?? []).some((x) => isAddressEqual(x, a)),
  };
}

/** KeyChain stubs for flows that never meet a recovered Safe. */
const noSigner = { getSigner: async () => NO_SIGNER, findSafesByOwner: async () => [] as Address[] };

const safeOf = (pk: TestPasskey) => predictSafeAddress({ x: pk.x, y: pk.y });

describe('resolveIdentity (adapter address)', () => {
  const safe = getAddress('0xe3d18fecdcf8e8b656b11340790f7c0147632deb');
  it('migrated: the linked legacy account', async () => {
    expect(await resolveIdentity(safe, identityChain({ links: { [safe.toLowerCase()]: [LEGACY] } }))).toEqual({ identity: LEGACY, kind: 'legacy' });
  });
  it('passkey-only: the Safe itself', async () => {
    expect(await resolveIdentity(safe, identityChain())).toEqual({ identity: safe, kind: 'safe' });
  });
  it('after a v3 moveTo: the Safe, even while it still administers the legacy vault', async () => {
    const chain = identityChain({ links: { [safe.toLowerCase()]: [LEGACY] }, v3: [safe] });
    expect(await resolveIdentity(safe, chain)).toEqual({ identity: safe, kind: 'moved' });
  });
  it('several legacy accounts: the citizen one wins', async () => {
    const chain = identityChain({ links: { [safe.toLowerCase()]: [LEGACY2, LEGACY] }, v2: [LEGACY] });
    expect((await resolveIdentity(safe, chain)).identity).toBe(LEGACY);
  });
});

describe('resolveCredentialKey (credential → key → Safe)', () => {
  const pk = newTestPasskey();
  const disc = (challenge: Hex) => ({ ...assertionFor(pk, challenge), credentialId: 'cred-1', userHandle: 'aGFuZGxl' });
  const noChain: KeyChain = {
    hasCode: async () => false,
    findLinkedLegacies: async () => [],
    isKnownAccount: async () => false,
    getSigner: async () => NO_SIGNER,
    findSafesByOwner: async () => [],
  };
  /** A chain where exactly these addresses have code. */
  const knownChain = (p: { hasCode: Address[] }): KeyChain => ({
    ...noChain,
    hasCode: async (a) => p.hasCode.some((x) => isAddressEqual(x, a)),
  });
  /** The per-key signer exists only for the real key (the other recovered candidate gets another address). */
  const signerOfPk = async (x: Hex) => (x === pk.x ? SIGNER : OTHER_SIGNER);

  it('uses the local record when the credential matches (no recovery, no second prompt)', async () => {
    const signAgain = jest.fn();
    const rec = { credentialId: 'cred-1', x: pk.x, y: pk.y, safe: LEGACY2, owner: LEGACY2, ownerType: 'webauthnSigner' as const };
    const k = await resolveCredentialKey(disc(`0x${'01'.repeat(32)}`), { local: [null, rec], chain: noChain, signAgain });
    expect(k).toEqual({ x: pk.x, y: pk.y, safe: LEGACY2, owner: LEGACY2, ownerType: 'webauthnSigner' });
    expect(signAgain).not.toHaveBeenCalled();
  });

  it('recovers the key and picks the candidate whose Safe is linked on chain', async () => {
    const safe = safeOf(pk);
    const chain: KeyChain = { ...noChain, findLinkedLegacies: async (s) => (isAddressEqual(s, safe) ? [LEGACY] : []) };
    const signAgain = jest.fn();
    const k = await resolveCredentialKey(disc(`0x${'02'.repeat(32)}`), { local: [], chain, signAgain });
    expect(k).toMatchObject({ x: pk.x, y: pk.y, safe, owner: SAFE_WEBAUTHN_SHARED_SIGNER, ownerType: 'sharedSigner' });
    expect(signAgain).not.toHaveBeenCalled();
  });

  it('a users row decides for a counterfactual passkey-only account', async () => {
    const safe = safeOf(pk);
    const chain: KeyChain = { ...noChain, isKnownAccount: async (a) => isAddressEqual(a, safe) };
    const k = await resolveCredentialKey(disc(`0x${'03'.repeat(32)}`), { local: [], chain, signAgain: jest.fn() });
    expect(k.safe).toBe(safe);
  });

  it('with no trace anywhere, one more assertion by the same credential decides', async () => {
    const signAgain = jest.fn(async (id: string) => {
      expect(id).toBe('cred-1');
      return assertionFor(pk, `0x${'05'.repeat(32)}`);
    });
    const k = await resolveCredentialKey(disc(`0x${'04'.repeat(32)}`), { local: [], chain: noChain, signAgain });
    expect(k.safe).toBe(safeOf(pk));
    expect(signAgain).toHaveBeenCalledTimes(1);
  });

  // Review Focus 1: the phone that ran the recovery deployed a throwaway SharedSigner Safe for
  // its new key, so that Safe "is known" too. The Safe owned by the per-key signer must win.
  it('a recovered Safe wins over the throwaway Safe the recovery phone deployed', async () => {
    const signAgain = jest.fn();
    const findSafesByOwner = jest.fn(async (o: Address) => (isAddressEqual(o, SIGNER) ? [RECOVERED] : []));
    const chain: KeyChain = { ...knownChain({ hasCode: [safeOf(pk), SIGNER] }), getSigner: signerOfPk, findSafesByOwner };
    const key = await resolveCredentialKey(disc(`0x${'06'.repeat(32)}`), { local: [], chain, signAgain });
    expect(key).toEqual({ x: pk.x, y: pk.y, safe: RECOVERED, owner: SIGNER, ownerType: 'webauthnSigner' });
    expect(findSafesByOwner).toHaveBeenCalledWith(SIGNER);
    expect(signAgain).not.toHaveBeenCalled();
  });

  it("no signer contract → no log scan, today's behaviour", async () => {
    const findSafesByOwner = jest.fn(async () => [] as Address[]);
    const chain: KeyChain = { ...knownChain({ hasCode: [safeOf(pk)] }), getSigner: signerOfPk, findSafesByOwner };
    const key = await resolveCredentialKey(disc(`0x${'07'.repeat(32)}`), { local: [], chain, signAgain: jest.fn() });
    expect(findSafesByOwner).not.toHaveBeenCalled();
    expect(key).toMatchObject({ safe: safeOf(pk), owner: SAFE_WEBAUTHN_SHARED_SIGNER, ownerType: 'sharedSigner' });
  });

  it('a signer that owns several Safes is ambiguous', async () => {
    const chain: KeyChain = {
      ...knownChain({ hasCode: [SIGNER] }),
      getSigner: signerOfPk,
      findSafesByOwner: async () => [RECOVERED, LEGACY2],
    };
    await expect(resolveCredentialKey(disc(`0x${'08'.repeat(32)}`), { local: [], chain, signAgain: jest.fn() })).rejects.toThrow(
      'passt zu mehreren Konten',
    );
  });

  it('several valid Safes for the signer: the single one with history wins', async () => {
    const chain: KeyChain = {
      ...knownChain({ hasCode: [SIGNER] }),
      getSigner: signerOfPk,
      findSafesByOwner: async () => [LEGACY2, RECOVERED],
      isKnownAccount: async (a) => isAddressEqual(a, RECOVERED),
    };
    const key = await resolveCredentialKey(disc(`0x${'0a'.repeat(32)}`), { local: [], chain, signAgain: jest.fn() });
    expect(key).toMatchObject({ safe: RECOVERED, owner: SIGNER, ownerType: 'webauthnSigner' });
  });

  it('a transport error on the recovered Safe\'s getOwners stops the sign-in (no fallback to the throwaway Safe)', async () => {
    const lookup = {
      ownerLogsFor: async () => [{ emitter: RECOVERED, blockNumber: 1n }],
      isPasskeySafe: async () => true,
      readOwners: async () => {
        throw new Error('HTTP request failed: timeout');
      },
    };
    const chain: KeyChain = {
      ...knownChain({ hasCode: [safeOf(pk), SIGNER] }),
      getSigner: signerOfPk,
      findSafesByOwner: (o) => findSafesByOwner(o, lookup),
    };
    await expect(resolveCredentialKey(disc(`0x${'0b'.repeat(32)}`), { local: [], chain, signAgain: jest.fn() })).rejects.toThrow(
      PasskeySignInError,
    );
  });

  it('a valid attacker-built Safe with a much newer AddedOwner log loses to the real Safe with history', async () => {
    const ATTACKER = getAddress('0x00000000000000000000000000000000000ba0ba');
    const client = shapeClient({
      tip: 1_000n,
      safes: [RECOVERED, ATTACKER],
      owners: { [RECOVERED]: [SIGNER], [ATTACKER]: [SIGNER] },
      logs: [
        { emitter: ATTACKER, block: 995n }, // newest batch
        { emitter: RECOVERED, block: 120n }, // the real finalize, > one batch (4 x 50 blocks) older
      ],
    });
    const lookup = createLookupChain(client as any, { readGuardians: async () => [], range: 50n, passkeyFromBlock: 0n });
    const chain: KeyChain = {
      ...knownChain({ hasCode: [safeOf(pk), SIGNER, RECOVERED, ATTACKER] }),
      getSigner: signerOfPk,
      findSafesByOwner: (o) => findSafesByOwner(o, lookup),
      findLinkedLegacies: async (s) => (isAddressEqual(s, RECOVERED) ? [LEGACY] : []),
    };
    const key = await resolveCredentialKey(disc(`0x${'0c'.repeat(32)}`), { local: [], chain, signAgain: jest.fn() });
    expect(key).toEqual({ x: pk.x, y: pk.y, safe: RECOVERED, owner: SIGNER, ownerType: 'webauthnSigner' });
  });

  it('a transient -32603 (viem reports it as a revert) on the real Safe stops the sign-in, no fallback', async () => {
    for (const failRead of [{ getModulesPaginated: internalRpcError() }, { getOwners: internalRpcError('getOwners') }]) {
      const client = shapeClient({
        tip: 100n,
        safes: [RECOVERED],
        owners: { [RECOVERED]: [SIGNER] },
        logs: [{ emitter: RECOVERED, block: 60n }],
        failRead,
      });
      const lookup = createLookupChain(client as any, { readGuardians: async () => [], range: 50n, passkeyFromBlock: 0n });
      const chain: KeyChain = {
        ...knownChain({ hasCode: [safeOf(pk), SIGNER, RECOVERED] }),
        getSigner: signerOfPk,
        findSafesByOwner: (o) => findSafesByOwner(o, lookup),
      };
      await expect(resolveCredentialKey(disc(`0x${'0e'.repeat(32)}`), { local: [], chain, signAgain: jest.fn() })).rejects.toThrow(
        PasskeySignInError,
      );
    }
  });

  it('two valid Safes, neither (or both) with history → ambiguous, never a silent pick', async () => {
    const chain: KeyChain = {
      ...knownChain({ hasCode: [SIGNER] }),
      getSigner: signerOfPk,
      findSafesByOwner: async () => [LEGACY2, RECOVERED],
      isKnownAccount: async () => true,
    };
    await expect(resolveCredentialKey(disc(`0x${'0d'.repeat(32)}`), { local: [], chain, signAgain: jest.fn() })).rejects.toThrow(
      'passt zu mehreren Konten',
    );
  });

  it('a signer contract whose Safe lookup fails stops the sign-in instead of falling back to the throwaway Safe', async () => {
    const chain: KeyChain = {
      ...knownChain({ hasCode: [safeOf(pk), SIGNER] }),
      getSigner: signerOfPk,
      findSafesByOwner: async () => {
        throw new Error('rpc down');
      },
    };
    await expect(resolveCredentialKey(disc(`0x${'09'.repeat(32)}`), { local: [], chain, signAgain: jest.fn() })).rejects.toThrow(
      PasskeySignInError,
    );
  });
});

function signInDeps(pk: TestPasskey, over: Partial<SignInDeps> = {}) {
  const migrationStorage = mem();
  const sessionStorage = mem();
  let n = 0;
  const deps: SignInDeps & { createPasskey: jest.Mock } = {
    migrationStorage,
    sessionStorage,
    randomChallenge: () => `0x${(++n).toString(16).padStart(2, '0').repeat(32)}` as Hex,
    getDiscoverableAssertion: async (c) => ({ ...assertionFor(pk, c), credentialId: 'cred-9', userHandle: null }),
    signWithCredential: async (_id, c) => assertionFor(pk, c),
    keyChain: { hasCode: async () => false, findLinkedLegacies: async () => [], ...noSigner },
    identityChain: identityChain(),
    createPasskey: jest.fn(async () => ({ credentialId: 'new-cred', x: pk.x, y: pk.y, prfSupported: true })),
    ...over,
  };
  return { deps, migrationStorage, sessionStorage };
}

describe('signInWithPasskey', () => {
  it('Safe → legacy: persists passkey_session_v1 with identity = legacy and writes a missing migration record', async () => {
    const pk = newTestPasskey();
    const safe = safeOf(pk);
    const links = { [safe.toLowerCase()]: [LEGACY] };
    const { deps, migrationStorage, sessionStorage } = signInDeps(pk, {
      keyChain: { hasCode: async (a) => isAddressEqual(a, safe), findLinkedLegacies: async () => [], ...noSigner },
      identityChain: identityChain({ links }),
    });
    const res = await signInWithPasskey(deps);
    expect(res).toMatchObject({ status: 'signedIn', kind: 'legacy', session: { safe, identity: LEGACY, credentialId: 'cred-9' } });
    expect(await loadPasskeySession(sessionStorage)).toMatchObject({ safe, identity: LEGACY, x: pk.x, y: pk.y });
    expect(await loadMigrationRecord(migrationStorage)).toMatchObject({ safe, legacy: LEGACY, status: 'done' });
    expect([...sessionStorage.m.keys()]).toEqual([PASSKEY_SESSION_KEY]);
  });

  it('never overwrites an existing migration record', async () => {
    const pk = newTestPasskey();
    const { deps, migrationStorage } = signInDeps(pk);
    const other = JSON.stringify({ credentialId: 'other', x: pk.x, y: pk.y, safe: LEGACY2, status: 'passkeyCreated' });
    migrationStorage.m.set(MIGRATION_STORE_KEY, other);
    await signInWithPasskey(deps);
    expect(migrationStorage.m.get(MIGRATION_STORE_KEY)).toBe(other);
  });

  it('a cancelled sheet is a quiet cancel and stores nothing', async () => {
    const pk = newTestPasskey();
    const { deps, sessionStorage } = signInDeps(pk, {
      getDiscoverableAssertion: async () => {
        throw Object.assign(new Error('x'), { name: 'PasskeyCancelledError' });
      },
    });
    expect(await signInWithPasskey(deps)).toEqual({ status: 'cancelled' });
    expect(sessionStorage.m.size).toBe(0);
  });
});

describe('signUpWithPasskey', () => {
  it('creates a passkey-only account: identity = the counterfactual Safe', async () => {
    const pk = newTestPasskey();
    const { deps, sessionStorage, migrationStorage } = signInDeps(pk);
    const res = await signUpWithPasskey('Röbel-Konto', deps);
    const safe = safeOf(pk);
    expect(res).toMatchObject({ status: 'signedIn', kind: 'safe', session: { safe, identity: safe, credentialId: 'new-cred' } });
    expect(await loadPasskeySession(sessionStorage)).toMatchObject({ identity: safe });
    expect(await loadMigrationRecord(migrationStorage)).toMatchObject({ safe, status: 'passkeyCreated' });
    expect((await loadMigrationRecord(migrationStorage))?.legacy).toBeUndefined();
  });

  it('refuses to turn an unfinished migration on this device into a Safe-only account', async () => {
    const pk = newTestPasskey();
    const { deps, migrationStorage, sessionStorage } = signInDeps(pk);
    migrationStorage.m.set(
      MIGRATION_STORE_KEY,
      JSON.stringify({ credentialId: 'c', x: pk.x, y: pk.y, safe: safeOf(pk), legacy: LEGACY, status: 'passkeyCreated' }),
    );
    const res = await signUpWithPasskey('Röbel-Konto', deps);
    expect(res.status).toBe('error');
    expect(deps.createPasskey).not.toHaveBeenCalled();
    expect(sessionStorage.m.size).toBe(0);
  });
});

describe('signInFromMigrationRecord (settings → Mit Passkey anmelden)', () => {
  it('switches a migrated person to the passkey without a prompt', async () => {
    const pk = newTestPasskey();
    const safe = safeOf(pk);
    const { deps, migrationStorage, sessionStorage } = signInDeps(pk, { identityChain: identityChain({ links: { [safe.toLowerCase()]: [LEGACY] } }) });
    migrationStorage.m.set(MIGRATION_STORE_KEY, JSON.stringify({ credentialId: 'c', x: pk.x, y: pk.y, safe, legacy: LEGACY, status: 'done' }));
    const res = await signInFromMigrationRecord(deps);
    expect(res).toMatchObject({ status: 'signedIn', session: { identity: LEGACY, safe } });
    expect(await loadPasskeySession(sessionStorage)).toMatchObject({ identity: LEGACY });
  });

  it('refuses when the handover is not on chain yet', async () => {
    const pk = newTestPasskey();
    const { deps, migrationStorage, sessionStorage } = signInDeps(pk);
    migrationStorage.m.set(MIGRATION_STORE_KEY, JSON.stringify({ credentialId: 'c', x: pk.x, y: pk.y, safe: safeOf(pk), legacy: LEGACY, status: 'done' }));
    expect((await signInFromMigrationRecord(deps)).status).toBe('error');
    expect(sessionStorage.m.size).toBe(0);
  });
});
