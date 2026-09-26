jest.mock('react-native-passkey', () => ({ Passkey: { create: jest.fn(), get: jest.fn(), isSupported: () => true } }));

import { decodeFunctionData, getAddress, type Hex } from 'viem';
import { PasskeyCancelledError, PasskeyNotSupportedError } from '../webauthn';
import { encodeSetPermissions, type SignerPermissionRequest } from '../legacy-handover';
import {
  MIGRATION_STORE_KEY,
  WRAPPED_MACI_KEY,
  WRAPPED_NOSTR_KEY,
  runPasskeyMigration,
  loadMigrationRecord,
  type MigrationDeps,
  type MigrationStep,
} from '../migration';
import vector from './passkey-safe-vector.json';

const legacy = getAddress(vector.handover.legacyAccount);
const x = vector.x as Hex;
const y = vector.y as Hex;
const safe = getAddress(vector.safeAddress);
const SIG: Hex = `0x${'ab'.repeat(65)}`;
const PRF: Hex = `0x${'11'.repeat(32)}`;
const TX: Hex = `0x${'cd'.repeat(32)}`;
const OP: Hex = `0x${'ef'.repeat(32)}`;

const setPermissionsAbi = [
  {
    type: 'function',
    name: 'setPermissionsForSigner',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: '_req',
        type: 'tuple',
        components: [
          { name: 'signer', type: 'address' },
          { name: 'isAdmin', type: 'uint8' },
          { name: 'approvedTargets', type: 'address[]' },
          { name: 'nativeTokenLimitPerTransaction', type: 'uint256' },
          { name: 'permissionStartTimestamp', type: 'uint128' },
          { name: 'permissionEndTimestamp', type: 'uint128' },
          { name: 'reqValidityStartTimestamp', type: 'uint128' },
          { name: 'reqValidityEndTimestamp', type: 'uint128' },
          { name: 'uid', type: 'bytes32' },
        ],
      },
      { name: '_signature', type: 'bytes' },
    ],
    outputs: [],
  },
] as const;

function makeDeps(overrides: Partial<MigrationDeps> = {}) {
  const store = new Map<string, string>();
  const signed: SignerPermissionRequest[] = [];
  const deps: MigrationDeps = {
    storage: {
      getItem: jest.fn(async (k: string) => store.get(k) ?? null),
      setItem: jest.fn(async (k: string, v: string) => {
        store.set(k, v);
      }),
    },
    createPasskey: jest.fn(async () => ({ credentialId: 'cred-1', x, y, prfSupported: true })),
    getPrfSecret: jest.fn(async () => PRF),
    wrapSecret: jest.fn(async (_prf: Hex, label: string, secret: Uint8Array) => `pkv1:${label}:${secret.length}`),
    readMaciSecret: jest.fn(async () => new TextEncoder().encode('{"privKey":"macisk"}')),
    readNostrSecret: jest.fn(async () => new Uint8Array(32).fill(7)),
    readIsAdmin: jest.fn(async () => false),
    signTypedData: jest.fn(async (typed: any) => {
      signed.push(typed.message);
      return SIG;
    }),
    isSafeDeployed: jest.fn(async () => false),
    sendPasskeyUserOp: jest.fn(async () => ({ userOpHash: OP, txHash: TX })),
    now: () => 1_790_000_000,
    ...overrides,
  };
  return { deps, store, signed };
}

describe('runPasskeyMigration', () => {
  it('cancel at the passkey sheet → idle, nothing persisted', async () => {
    const { deps, store } = makeDeps({
      createPasskey: jest.fn(async () => {
        throw new PasskeyCancelledError();
      }),
    });
    const res = await runPasskeyMigration({ legacy, userName: 'Max' }, deps);
    expect(res.status).toBe('idle');
    expect(res.status === 'idle' && res.reason).toBe('cancelled');
    expect(res.status === 'idle' && res.message).toMatch(/abgebrochen/i);
    expect(store.size).toBe(0);
    expect(deps.storage.setItem).not.toHaveBeenCalled();
    expect(deps.sendPasskeyUserOp).not.toHaveBeenCalled();
    expect(deps.signTypedData).not.toHaveBeenCalled();
  });

  it('no passkey support → idle with a German message, nothing persisted', async () => {
    const { deps, store } = makeDeps({
      createPasskey: jest.fn(async () => {
        throw new PasskeyNotSupportedError();
      }),
    });
    const res = await runPasskeyMigration({ legacy, userName: 'Max' }, deps);
    expect(res.status).toBe('idle');
    expect(res.status === 'idle' && res.reason).toBe('notSupported');
    expect(store.size).toBe(0);
  });

  it('happy path → one sponsored userOp with exactly one call {to: legacy, data: setPermissionsForSigner(isAdmin 1)}', async () => {
    const { deps, store, signed } = makeDeps();
    const steps: MigrationStep[] = [];
    const res = await runPasskeyMigration({ legacy, userName: 'Max' }, deps, (p) => steps.push(p.step));

    expect(res).toMatchObject({ status: 'done', safe, rewrap: 'done', txHash: TX, alreadyAdmin: false });
    expect(steps).toEqual(['creatingPasskey', 'rewrappingSecrets', 'signingHandover', 'submitting', 'done']);

    expect(deps.isSafeDeployed).toHaveBeenCalledWith(safe);
    expect(deps.sendPasskeyUserOp).toHaveBeenCalledTimes(1);
    const args = (deps.sendPasskeyUserOp as jest.Mock).mock.calls[0][0];
    expect(args).toMatchObject({ credentialId: 'cred-1', x, y, deployed: false, legacy });
    expect(args.calls).toHaveLength(1);
    expect(args.calls[0].to).toBe(legacy);

    expect(signed).toHaveLength(1);
    const req = signed[0];
    expect(req.isAdmin).toBe(1);
    expect(req.signer).toBe(safe);
    expect(args.calls[0].data).toBe(encodeSetPermissions(req, SIG));

    // the typed data is on the legacy account's domain, chain 100
    const typed = (deps.signTypedData as jest.Mock).mock.calls[0][0];
    expect(typed.domain).toMatchObject({ chainId: 100, verifyingContract: legacy });

    // secrets wrapped under the PRF, originals untouched (the migration never writes them)
    expect(store.get(WRAPPED_MACI_KEY)).toMatch(/^pkv1:/);
    expect(store.get(WRAPPED_NOSTR_KEY)).toMatch(/^pkv1:/);
    const written = (deps.storage.setItem as jest.Mock).mock.calls.map((c) => c[0]);
    expect(new Set(written)).toEqual(new Set([MIGRATION_STORE_KEY, WRAPPED_MACI_KEY, WRAPPED_NOSTR_KEY]));

    const rec = await loadMigrationRecord(deps.storage);
    expect(rec).toMatchObject({ credentialId: 'cred-1', x, y, safe, legacy, status: 'done', rewrap: 'done', txHash: TX });
  });

  it('passes deployed=true when the Safe already exists', async () => {
    const { deps } = makeDeps({ isSafeDeployed: jest.fn(async () => true) });
    await runPasskeyMigration({ legacy, userName: 'Max' }, deps);
    expect((deps.sendPasskeyUserOp as jest.Mock).mock.calls[0][0].deployed).toBe(true);
  });

  it('PRF unsupported → rewrap skipped, nothing wrapped, handover still runs', async () => {
    const { deps, store } = makeDeps({ getPrfSecret: jest.fn(async () => null) });
    const res = await runPasskeyMigration({ legacy, userName: 'Max' }, deps);
    expect(res).toMatchObject({ status: 'done', rewrap: 'skipped' });
    expect(deps.wrapSecret).not.toHaveBeenCalled();
    expect(store.has(WRAPPED_MACI_KEY)).toBe(false);
    expect(store.has(WRAPPED_NOSTR_KEY)).toBe(false);
    expect(deps.sendPasskeyUserOp).toHaveBeenCalledTimes(1);
  });

  it('already co-admin → no signature and no userOp', async () => {
    const { deps } = makeDeps({ readIsAdmin: jest.fn(async () => true) });
    const res = await runPasskeyMigration({ legacy, userName: 'Max' }, deps);
    expect(res).toMatchObject({ status: 'done', alreadyAdmin: true, txHash: null });
    expect(deps.readIsAdmin).toHaveBeenCalledWith(legacy, safe);
    expect(deps.signTypedData).not.toHaveBeenCalled();
    expect(deps.sendPasskeyUserOp).not.toHaveBeenCalled();
  });

  it('resumes with the persisted credential instead of creating a second passkey', async () => {
    const first = makeDeps({
      sendPasskeyUserOp: jest.fn(async () => {
        throw new Error('bundler down');
      }),
    });
    const failed = await runPasskeyMigration({ legacy, userName: 'Max' }, first.deps);
    expect(failed.status).toBe('error');
    const rec = await loadMigrationRecord(first.deps.storage);
    expect(rec).toMatchObject({ credentialId: 'cred-1', status: 'passkeyCreated', rewrap: 'done' });

    // second run over the same storage
    const second = makeDeps({ storage: first.deps.storage });
    const res = await runPasskeyMigration({ legacy, userName: 'Max' }, second.deps);
    expect(res.status).toBe('done');
    expect(second.deps.createPasskey).not.toHaveBeenCalled();
    // rewrap already done → no second PRF prompt
    expect(second.deps.getPrfSecret).not.toHaveBeenCalled();
    expect(second.deps.sendPasskeyUserOp).toHaveBeenCalledTimes(1);
  });

  it('refuses a persisted passkey account that belongs to a different legacy account', async () => {
    const { deps } = makeDeps();
    await runPasskeyMigration({ legacy, userName: 'Max' }, deps);
    const other = getAddress('0x000000000000000000000000000000000000dEaD');
    const again = makeDeps({ storage: deps.storage });
    const res = await runPasskeyMigration({ legacy: other, userName: 'Max' }, again.deps);
    expect(res.status).toBe('error');
    expect(again.deps.sendPasskeyUserOp).not.toHaveBeenCalled();
    expect(again.deps.signTypedData).not.toHaveBeenCalled();
  });

  it('never signs or submits an isAdmin 2 (remove) request', async () => {
    const { deps, signed } = makeDeps();
    await runPasskeyMigration({ legacy, userName: 'Max' }, deps);
    for (const req of signed) expect(req.isAdmin).toBe(1);
    for (const [call] of (deps.sendPasskeyUserOp as jest.Mock).mock.calls) {
      for (const c of call.calls) {
        const decoded = decodeFunctionData({ abi: setPermissionsAbi, data: c.data });
        expect(decoded.args[0].isAdmin).toBe(1);
      }
    }
  });

  it('a cancelled passkey prompt during the handover returns to idle and keeps the credential for resume', async () => {
    const { deps } = makeDeps({
      sendPasskeyUserOp: jest.fn(async () => {
        throw new PasskeyCancelledError();
      }),
    });
    const res = await runPasskeyMigration({ legacy, userName: 'Max' }, deps);
    expect(res).toMatchObject({ status: 'idle', reason: 'cancelled' });
    expect(await loadMigrationRecord(deps.storage)).toMatchObject({ credentialId: 'cred-1', status: 'passkeyCreated' });
  });

  it('SecureStore failure right after passkey creation → German error state, never a throw', async () => {
    const { deps } = makeDeps();
    (deps.storage.setItem as jest.Mock).mockImplementation(async () => {
      throw new Error('SecureStore: keychain unavailable');
    });
    const steps: MigrationStep[] = [];
    const res = await runPasskeyMigration({ legacy, userName: 'Max' }, deps, (p) => steps.push(p.step));
    expect(res.status).toBe('error');
    expect(res.status === 'error' && res.message).toMatch(/gespeichert/);
    expect(res.status === 'error' && res.detail).toMatch(/keychain/);
    expect(steps[steps.length - 1]).toBe('error');
    expect(deps.sendPasskeyUserOp).not.toHaveBeenCalled();
  });

  it('SecureStore failure after the handover landed → German error state (the chain is already done)', async () => {
    const { deps, store } = makeDeps();
    let writes = 0;
    (deps.storage.setItem as jest.Mock).mockImplementation(async (k: string, v: string) => {
      // allow the passkey record, the wrapped secrets and the rewrap record; fail the final 'done'
      if (k === 'passkey_migration_v1' && JSON.parse(v).status === 'done') throw new Error('SecureStore full');
      writes++;
      store.set(k, v);
    });
    const res = await runPasskeyMigration({ legacy, userName: 'Max' }, deps);
    expect(writes).toBeGreaterThan(0);
    expect(deps.sendPasskeyUserOp).toHaveBeenCalledTimes(1);
    expect(res.status).toBe('error');
    expect(res.status === 'error' && res.message).toMatch(/verbunden/);
  });
});
