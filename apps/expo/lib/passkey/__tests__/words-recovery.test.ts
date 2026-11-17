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
  findWalletsByWords,
  restoreKeysWithVaultKey,
  signWordApprovals,
  wordsKeyRestoreMessage,
} from '../words-recovery';
import { WORDS_OFF_BLOB, unwrapWordsVault } from '../words-vault';
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
    const chain = { guardianLogsFor: async () => [{ wallet: SAFE, guardian: POOL[0] }], readGuardians: async () => [POOL[0], P1], readThreshold: async () => 2n };
    expect(await findWalletsByWords(POOL, chain)).toEqual([]);
  });

  it('words that were removed find nothing even though the log exists', async () => {
    const chain = { guardianLogsFor: async () => [{ wallet: SAFE, guardian: POOL[0] }], readGuardians: async () => [P1], readThreshold: async () => 1n };
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
    };
    expect(await findWalletsByWords(POOL, chain)).toEqual([
      { wallet: SAFE, wordGuardians: [POOL[0], POOL[1]], threshold: 2 },
      { wallet: SAFE2, wordGuardians: [POOL[0]], threshold: 1 },
    ]);
    expect(chain.guardianLogsFor).toHaveBeenCalledWith(POOL);
  });

  it('a read error propagates instead of reading as "no account"', async () => {
    const chain = {
      guardianLogsFor: async () => [{ wallet: SAFE, guardian: POOL[0] }],
      readGuardians: async () => Promise.reject(new Error('rpc down')),
      readThreshold: async () => 1n,
    };
    await expect(findWalletsByWords(POOL, chain)).rejects.toThrow('rpc down');
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

    expect(r).toEqual({ restored: ['maci', 'salt'], missing: ['nostr'], rewrapped: true });
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
    expect(r).toEqual({ restored: [], missing: ['maci', 'nostr', 'salt'], rewrapped: true });
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
    expect(r).toEqual({ restored: ['nostr'], missing: ['maci', 'salt'], rewrapped: false });
    expect(bytesToHex(nostr)).toMatch(/^0x03/);
  });

  it('a failed read throws (the screen offers a retry)', async () => {
    const remote: RemoteBackup = { read: async () => Promise.reject(new Error('offline')), write: jest.fn() };
    await expect(
      restoreKeysWithVaultKey({ vaultKey: KEY_A, remote, getPrf: async () => PRF2, wrap: wrapSecret, unwrap: unwrapSecret, saveLocal: jest.fn() }),
    ).rejects.toThrow('offline');
  });
});
