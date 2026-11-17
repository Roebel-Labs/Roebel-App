import { bytesToHex, getAddress, recoverTypedDataAddress, type Address, type Hex } from 'viem';
import { SOCIAL_RECOVERY_MODULE } from '../constants';
import { SLOT_LABEL } from '../derived-keys';
import { encodeMultiConfirmRecovery, recoveryApprovalTypedData } from '../guardians';
import type { KeyBackupBlobs, RemoteBackup, RemoteRead } from '../key-backup';
import { unwrapSecret, wrapSecret } from '../prf-vault';
import { createLookupChain, guardianAddedEvent } from '../recovery-lookup';
import { deriveWordAddresses } from '../words';
import {
  NO_WORDS_ACCOUNT_MESSAGE,
  WORDS_VAULT_KEY_MISSING,
  clearPendingWordsRestore,
  findWalletsByWords,
  loadPendingVaultKey,
  loadPendingWordsRestore,
  markWordsRecoveryDone,
  pendingRestoreVaultKeySlot,
  pendingWordsRestoreKey,
  runPendingWordsRestore,
  savePendingVaultKey,
  type WordsKeyRestore,
  restoreKeysWithVaultKey,
  signWordApprovals,
  wordsKeyRestoreMessage,
} from '../words-recovery';
import { WORDS_OFF_BLOB, WORDS_VAULT_KEY_STORE, unwrapWordsVault } from '../words-vault';
import { WORDS_POOL_KEY, loadWordsPool } from '../words-guardians';
import v from './words-recovery-vector.json';

const addr = (n: number) => getAddress(`0x${n.toString(16).padStart(40, '0')}`);
const SAFE = addr(0x5a);
const SAFE2 = addr(0x5b);
const P1 = addr(0xa1);
const POOL = deriveWordAddresses(v.phrase);
const wallet = v.wallet as Address;
const newOwner = v.newOwner as Address;

describe('signWordApprovals', () => {
  it('reproduces the fork vector: same signers, same signatures, same calldata', async () => {
    const approvals = await signWordApprovals({
      phrase: v.phrase,
      wallet,
      newOwner,
      nonce: BigInt(v.nonce),
      guardians: v.guardians.map((g) => g.address as Address),
      threshold: 2,
    });
    expect(approvals).toEqual(v.guardians.map((g) => ({ signer: g.address, signature: g.signature })));
    expect(encodeMultiConfirmRecovery(wallet, [newOwner], 1, approvals, true).data).toBe(v.multiConfirmCalldata);
  });

  it('the vector guardians are pool indexes 0 and 1', () => {
    expect(v.guardians.map((g) => g.address)).toEqual(POOL.slice(0, 2));
  });

  it('a typo never signs anything', async () => {
    const typo = v.phrase.replace('junk', 'junkk');
    await expect(
      signWordApprovals({ phrase: typo, wallet, newOwner, nonce: 0n, guardians: POOL.slice(0, 2), threshold: 2 }),
    ).rejects.toThrow('Dieses Wort kennen wir nicht: junkk');
  });

  it('fewer word guardians than the threshold throws', async () => {
    await expect(
      signWordApprovals({ phrase: v.phrase, wallet, newOwner, nonce: 0n, guardians: [POOL[0], P1], threshold: 2 }),
    ).rejects.toThrow(/not enough word guardians/);
  });

  it('only the first `threshold` word guardians sign, in pool order', async () => {
    const approvals = await signWordApprovals({
      phrase: v.phrase,
      wallet,
      newOwner,
      nonce: 0n,
      guardians: [P1, POOL[4], POOL[2], POOL[3]],
      threshold: 2,
    });
    expect(approvals.map((a) => a.signer)).toEqual([POOL[2], POOL[3]]);
  });

  it('after a cancel the nonce moved: old approvals no longer match, new ones sign the new nonce', async () => {
    const base = { phrase: v.phrase, wallet, newOwner, guardians: POOL.slice(0, 2), threshold: 2 };
    const old = await signWordApprovals({ ...base, nonce: 0n });
    const fresh = await signWordApprovals({ ...base, nonce: 1n });
    for (let i = 0; i < 2; i++) {
      expect(fresh[i].signature).not.toBe(old[i].signature);
      // The old signature does not recover to the guardian under the new nonce: it is dead.
      const oldUnderNew = await recoverTypedDataAddress({ ...recoveryApprovalTypedData(wallet, [newOwner], 1, 1n), signature: old[i].signature });
      expect(oldUnderNew).not.toBe(old[i].signer);
      const freshUnderNew = await recoverTypedDataAddress({ ...recoveryApprovalTypedData(wallet, [newOwner], 1, 1n), signature: fresh[i].signature });
      expect(freshUnderNew).toBe(fresh[i].signer);
    }
  });
});

describe('findWalletsByWords', () => {
  it('fewer word guardians than the threshold: no account', async () => {
    const chain = { guardianLogsFor: async () => [{ wallet: SAFE, guardian: POOL[0] }], readGuardians: async () => [POOL[0], P1], readThreshold: async () => 2n, isPasskeySafe: async () => true };
    expect(await findWalletsByWords(POOL, chain)).toEqual([]);
  });

  it('words that were removed find nothing even though the log exists', async () => {
    const chain = { guardianLogsFor: async () => [{ wallet: SAFE, guardian: POOL[0] }], readGuardians: async () => [P1], readThreshold: async () => 1n, isPasskeySafe: async () => true };
    expect(await findWalletsByWords(POOL, chain)).toEqual([]);
  });

  it('finds each wallet once, with its word guardians in pool order', async () => {
    const chain = {
      guardianLogsFor: jest.fn(async () => [
        { wallet: SAFE, guardian: POOL[1] },
        { wallet: SAFE, guardian: POOL[0] },
        { wallet: SAFE2, guardian: POOL[0] },
      ]),
      readGuardians: async (w: Address) => (w === SAFE ? [P1, POOL[1], POOL[0]] : [POOL[0]]),
      readThreshold: async (w: Address) => (w === SAFE ? 2n : 1n),
      isPasskeySafe: async () => true,
    };
    expect(await findWalletsByWords(POOL, chain)).toEqual([
      { wallet: SAFE, wordGuardians: [POOL[0], POOL[1]], threshold: 2, recoveryLegacy: null },
      { wallet: SAFE2, wordGuardians: [POOL[0]], threshold: 1, recoveryLegacy: null },
    ]);
    expect(chain.guardianLogsFor).toHaveBeenCalledWith(POOL);
  });

  it('a read error propagates instead of reading as "no account"', async () => {
    const chain = {
      guardianLogsFor: async () => [{ wallet: SAFE, guardian: POOL[0] }],
      readGuardians: async () => Promise.reject(new Error('rpc down')),
      readThreshold: async () => 1n,
      isPasskeySafe: async () => true,
    };
    await expect(findWalletsByWords(POOL, chain)).rejects.toThrow('rpc down');
  });

  it('a decoy wallet that added the public pool addresses as guardians is not offered', async () => {
    const DECOY = addr(0xde);
    const chain = {
      guardianLogsFor: async () => [
        { wallet: DECOY, guardian: POOL[0] },
        { wallet: SAFE, guardian: POOL[0] },
      ],
      readGuardians: async () => [POOL[0]],
      readThreshold: async () => 1n,
      isPasskeySafe: jest.fn(async (w: Address) => w === SAFE),
    };
    expect(await findWalletsByWords(POOL, chain)).toEqual([{ wallet: SAFE, wordGuardians: [POOL[0]], threshold: 1, recoveryLegacy: null }]);
    expect(chain.isPasskeySafe).toHaveBeenCalledWith(DECOY);
  });

  it('I5: a migrated account keeps its legacy link (the one legacy account the Safe administers)', async () => {
    const LEGACY = addr(0x1e);
    const chain = {
      guardianLogsFor: async () => [{ wallet: SAFE, guardian: POOL[0] }],
      readGuardians: async () => [POOL[0]],
      readThreshold: async () => 1n,
      isPasskeySafe: async () => true,
      linkedLegacies: jest.fn(async () => [LEGACY]),
    };
    expect(await findWalletsByWords(POOL, chain)).toEqual([{ wallet: SAFE, wordGuardians: [POOL[0]], threshold: 1, recoveryLegacy: LEGACY }]);
    expect(chain.linkedLegacies).toHaveBeenCalledWith(SAFE);
    // a failed legacy lookup propagates (never a silent loss of the link)
    await expect(findWalletsByWords(POOL, { ...chain, linkedLegacies: async () => Promise.reject(new Error('rpc down')) })).rejects.toThrow('rpc down');
  });

  it('has the German message for "no account"', () => {
    expect(NO_WORDS_ACCOUNT_MESSAGE).toBe('Zu diesen Wörtern haben wir kein Konto gefunden. Vielleicht wurden sie ersetzt oder entfernt.');
  });
});

describe('LookupChain.guardianLogsFor', () => {
  it('scans GuardianAdded(wallet, guardian) on the SocialRecoveryModule for any of the given guardians', async () => {
    const getLogs = jest.fn(async (a: any) =>
      a.fromBlock === 0n ? [{ address: SOCIAL_RECOVERY_MODULE, blockNumber: 3n, logIndex: 0, args: { wallet: SAFE, guardian: POOL[0] } }] : [],
    );
    const client = { getBlockNumber: async () => 120n, getBlock: jest.fn(), getLogs, getCode: jest.fn(), getStorageAt: jest.fn(), readContract: jest.fn() };
    const chain = createLookupChain(client as any, { readGuardians: async () => [], range: 50n, passkeyFromBlock: 0n });
    expect(await chain.guardianLogsFor(POOL)).toEqual([{ wallet: SAFE, guardian: POOL[0] }]);
    expect(getLogs).toHaveBeenCalledTimes(3);
    const first = getLogs.mock.calls[0][0];
    expect(first.address).toBe(SOCIAL_RECOVERY_MODULE);
    expect(first.event).toBe(guardianAddedEvent);
    expect(first.args).toEqual({ guardian: POOL });
    expect(guardianAddedEvent.inputs.map((i) => i.name)).toEqual(['wallet', 'guardian']);
  });
});

describe('restoreKeysWithVaultKey', () => {
  const KEY_A = `0x${'a1'.repeat(32)}` as Hex;
  const PRF1 = `0x${'b1'.repeat(32)}` as Hex;
  const PRF2 = `0x${'c2'.repeat(32)}` as Hex;
  const maciBytes = new TextEncoder().encode('{"maci":"keypair"}');
  const saltBytes = new TextEncoder().encode('12345');

  function remoteWith(read: RemoteRead) {
    const writes: Array<{ blobs: KeyBackupBlobs; replace?: boolean }> = [];
    const remote: RemoteBackup = {
      read: jest.fn(async () => read),
      write: jest.fn(async (blobs: KeyBackupBlobs, replace?: boolean) => {
        writes.push({ blobs, replace });
        return 'stored' as const;
      }),
    };
    return { remote, writes };
  }

  it('brings back each _w blob and rewraps it under the new passkey', async () => {
    const blobs: KeyBackupBlobs = {
      maci: await wrapSecret(PRF1, SLOT_LABEL.maci, maciBytes),
      maci_w: await wrapSecret(KEY_A, SLOT_LABEL.maci, maciBytes),
      salt_w: await wrapSecret(KEY_A, SLOT_LABEL.salt, saltBytes),
      wvk: await wrapSecret(PRF1, 'roebel/words-vault-key/v1', new Uint8Array(32)),
    };
    const { remote, writes } = remoteWith({ status: 'found', blobs, prf: PRF2 });
    const saveLocal = jest.fn(async () => undefined);
    const getPrf = jest.fn(async () => null);
    const r = await restoreKeysWithVaultKey({ vaultKey: KEY_A, remote, getPrf, wrap: wrapSecret, unwrap: unwrapSecret, saveLocal, pool: POOL });

    expect(r).toEqual({ restored: ['maci', 'salt'], missing: ['nostr'], rewrapped: true, retryable: false });
    expect(saveLocal).toHaveBeenCalledWith('maci', maciBytes);
    expect(saveLocal).toHaveBeenCalledWith('salt', saltBytes);
    expect(getPrf).not.toHaveBeenCalled(); // the read's assertion already gave the PRF
    expect(writes).toHaveLength(1);
    expect(writes[0].replace).toBe(true);
    expect(Object.keys(writes[0].blobs).sort()).toEqual(['maci', 'salt', 'wvk']);
    expect(await unwrapSecret(PRF2, SLOT_LABEL.maci, writes[0].blobs.maci!)).toEqual(maciBytes);
    expect(await unwrapSecret(PRF2, SLOT_LABEL.salt, writes[0].blobs.salt!)).toEqual(saltBytes);
    await expect(unwrapSecret(PRF1, SLOT_LABEL.maci, writes[0].blobs.maci!)).rejects.toThrow();
    expect(await unwrapWordsVault(PRF2, writes[0].blobs.wvk!, unwrapSecret)).toEqual({ vaultKey: KEY_A, addresses: POOL });
  });

  it('a tombstoned or foreign _w slot is "no copy", never an error; the wvk is still rewritten', async () => {
    const blobs: KeyBackupBlobs = {
      maci_w: WORDS_OFF_BLOB,
      nostr_w: await wrapSecret(`0x${'dd'.repeat(32)}` as Hex, SLOT_LABEL.nostr, new Uint8Array(32).fill(7)),
      salt_w: WORDS_OFF_BLOB,
    };
    const { remote, writes } = remoteWith({ status: 'found', blobs, prf: PRF2 });
    const saveLocal = jest.fn(async () => undefined);
    const r = await restoreKeysWithVaultKey({ vaultKey: KEY_A, remote, getPrf: async () => null, wrap: wrapSecret, unwrap: unwrapSecret, saveLocal, pool: POOL });
    expect(r).toEqual({ restored: [], missing: ['maci', 'nostr', 'salt'], rewrapped: true, retryable: false });
    expect(saveLocal).not.toHaveBeenCalled();
    expect(Object.keys(writes[0].blobs)).toEqual(['wvk']);
    expect(wordsKeyRestoreMessage(r)).toMatch(/keine Sicherung deiner Schlüssel/);
  });

  it('a read through a cached token asks getPrf once; no PRF keeps the keys on the phone and writes nothing', async () => {
    const nostr = new Uint8Array(32).fill(3);
    const blobs: KeyBackupBlobs = { nostr_w: await wrapSecret(KEY_A, SLOT_LABEL.nostr, nostr) };
    const { remote, writes } = remoteWith({ status: 'found', blobs });
    const saveLocal = jest.fn(async () => undefined);
    const getPrf = jest.fn(async () => null);
    const r = await restoreKeysWithVaultKey({ vaultKey: KEY_A, remote, getPrf, wrap: wrapSecret, unwrap: unwrapSecret, saveLocal });
    expect(getPrf).toHaveBeenCalledTimes(1);
    expect(saveLocal).toHaveBeenCalledWith('nostr', nostr);
    expect(writes).toHaveLength(0);
    expect(r).toEqual({ restored: ['nostr'], missing: ['maci', 'salt'], rewrapped: false, retryable: false });
    expect(bytesToHex(nostr)).toMatch(/^0x03/);
  });

  it('a failed read throws (the screen offers a retry)', async () => {
    const remote: RemoteBackup = { read: async () => Promise.reject(new Error('offline')), write: jest.fn() };
    await expect(
      restoreKeysWithVaultKey({ vaultKey: KEY_A, remote, getPrf: async () => PRF2, wrap: wrapSecret, unwrap: unwrapSecret, saveLocal: jest.fn() }),
    ).rejects.toThrow('offline');
  });
});

describe('pending words restore (outlives the recovery state)', () => {
  const KEY = `0x${'a1'.repeat(32)}` as Hex;
  const OTHER_ACCOUNT_KEY = `0x${'e9'.repeat(32)}` as Hex;
  const done = { wallet: SAFE, credentialId: 'cred-1', x: `0x${'01'.repeat(32)}` as Hex, y: `0x${'02'.repeat(32)}` as Hex, signer: P1, wordsPool: POOL };

  function stores() {
    const kv = new Map<string, string>();
    const vault = new Map<string, string>([[WORDS_VAULT_KEY_STORE, OTHER_ACCOUNT_KEY]]);
    return {
      kv,
      vault,
      storage: {
        getItem: async (k: string) => kv.get(k) ?? null,
        setItem: async (k: string, v: string) => void kv.set(k, v),
        removeItem: async (k: string) => void kv.delete(k),
      },
      vaultStorage: {
        getItem: async (k: string) => vault.get(k) ?? null,
        setItem: async (k: string, v: string) => void vault.set(k, v),
        deleteItem: async (k: string) => void vault.delete(k),
      },
    };
  }
  const ok: WordsKeyRestore = { restored: ['maci'], missing: ['nostr', 'salt'], rewrapped: true, retryable: false };

  it('done saves the words pool and the marker (public data only; SecureStore-safe keys)', async () => {
    const st = stores();
    await markWordsRecoveryDone(done, st.storage, () => 42);
    expect(await loadWordsPool(st.storage)).toEqual({ addresses: POOL, confirmedAt: 42 });
    expect(st.kv.has(WORDS_POOL_KEY)).toBe(true);
    expect(await loadPendingWordsRestore(st.storage, SAFE)).toEqual(done);
    expect(st.kv.get(pendingWordsRestoreKey(SAFE))).not.toMatch(/0xa1a1/);
    for (const k of [pendingWordsRestoreKey(SAFE), pendingRestoreVaultKeySlot(SAFE)]) expect(k).toMatch(/^[A-Za-z0-9._-]+$/);
  });

  it('skipped without a restore: the marker and the per-wallet vault key stay for the settings offer', async () => {
    const st = stores();
    await savePendingVaultKey(st.vaultStorage, SAFE, KEY);
    await markWordsRecoveryDone(done, st.storage);
    // ...the recovery state is cleared, nothing else ran...
    expect(await loadPendingWordsRestore(st.storage, SAFE)).not.toBeNull();
    expect(await loadPendingVaultKey(st.vaultStorage, SAFE)).toBe(KEY);
    expect(await loadPendingWordsRestore(st.storage, SAFE2)).toBeNull();
  });

  it('the restore uses the per-wallet vault key, never the global one, and clears both on success', async () => {
    const st = stores();
    await savePendingVaultKey(st.vaultStorage, SAFE, KEY);
    await markWordsRecoveryDone(done, st.storage);
    const restore = jest.fn(async () => ok);
    expect(await runPendingWordsRestore(SAFE, { storage: st.storage, vault: st.vaultStorage, restore })).toEqual(ok);
    expect(restore).toHaveBeenCalledWith(done, KEY);
    expect(st.vault.get(WORDS_VAULT_KEY_STORE)).toBe(OTHER_ACCOUNT_KEY); // another account's key untouched
    expect(st.vault.has(pendingRestoreVaultKeySlot(SAFE))).toBe(false);
    expect(await loadPendingWordsRestore(st.storage, SAFE)).toBeNull();
  });

  it('a failed read or a retryable write keeps everything for the next try', async () => {
    const st = stores();
    await savePendingVaultKey(st.vaultStorage, SAFE, KEY);
    await markWordsRecoveryDone(done, st.storage);
    await expect(
      runPendingWordsRestore(SAFE, { storage: st.storage, vault: st.vaultStorage, restore: async () => Promise.reject(new Error('offline')) }),
    ).rejects.toThrow('offline');
    await runPendingWordsRestore(SAFE, { storage: st.storage, vault: st.vaultStorage, restore: async () => ({ ...ok, rewrapped: false, retryable: true }) });
    expect(await loadPendingWordsRestore(st.storage, SAFE)).not.toBeNull();
    expect(await loadPendingVaultKey(st.vaultStorage, SAFE)).toBe(KEY);
  });

  it('L5: reopened after a finished restore (no marker, no vault key): reported as done, nothing runs', async () => {
    const st = stores();
    const restore = jest.fn();
    const r = await runPendingWordsRestore(SAFE, { storage: st.storage, vault: st.vaultStorage, restore });
    expect(r).toEqual({ restored: [], missing: [], rewrapped: true, retryable: false });
    expect(wordsKeyRestoreMessage(r)).toBeNull();
    expect(restore).not.toHaveBeenCalled();
  });

  it('L6: a lost marker with the vault key still there is written again from the done state, then the restore runs', async () => {
    const st = stores();
    await savePendingVaultKey(st.vaultStorage, SAFE, KEY);
    const restore = jest.fn(async () => ok);
    const remark = jest.fn(() => markWordsRecoveryDone(done, st.storage));
    expect(await runPendingWordsRestore(SAFE, { storage: st.storage, vault: st.vaultStorage, restore, remark })).toEqual(ok);
    expect(remark).toHaveBeenCalledTimes(1);
    expect(restore).toHaveBeenCalledWith(done, KEY);
  });

  it('L6: the marker is written before the pool (a failing pool save never costs the marker)', async () => {
    const st = stores();
    const order: string[] = [];
    const storage = { ...st.storage, setItem: async (k: string, v: string) => { order.push(k); if (k === WORDS_POOL_KEY) throw new Error('disk'); await st.storage.setItem(k, v); } };
    await markWordsRecoveryDone(done, storage);
    expect(order).toEqual([pendingWordsRestoreKey(SAFE), WORDS_POOL_KEY]);
    expect(await loadPendingWordsRestore(st.storage, SAFE)).toEqual(done);
  });

  it('no vault key: a retry cannot help, so it clears the marker and throws the named error', async () => {
    const st = stores();
    await markWordsRecoveryDone(done, st.storage);
    const restore = jest.fn();
    await expect(runPendingWordsRestore(SAFE, { storage: st.storage, vault: st.vaultStorage, restore })).rejects.toMatchObject({ name: WORDS_VAULT_KEY_MISSING });
    expect(restore).not.toHaveBeenCalled();
    expect(await loadPendingWordsRestore(st.storage, SAFE)).toBeNull();
    await clearPendingWordsRestore(st.storage, st.vaultStorage, SAFE);
  });
});
