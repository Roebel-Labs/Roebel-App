jest.mock('react-native-passkey', () => ({ Passkey: { create: jest.fn(), get: jest.fn(), isSupported: () => true } }));

import { decodeFunctionData, getAddress, type Address, type Hex } from 'viem';
import { PasskeyCancelledError, PasskeyNotSupportedError } from '../webauthn';
import { MIGRATION_STORE_KEY, loadMigrationRecord } from '../migration';
import { socialRecoveryAbi, type RecoveryRequest } from '../guardians';
import { SAFE_WEBAUTHN_SIGNER_FACTORY, SOCIAL_RECOVERY_MODULE } from '../constants';
import { predictSafeAddress } from '../safe-address';
import {
  RECOVERY_STORE_KEY,
  abandonRecovery,
  executeRecoveryStep,
  finalizeRecoveryStep,
  formatRemaining,
  isForeignRecoveryPending,
  loadRecoveryState,
  ownerKindForCode,
  pollRecovery,
  recoveryWordsStatus,
  resumeRecovery,
  startRecovery,
  startWordsRecovery,
  type RecoveryDeps,
  type RecoveryState,
} from '../recovery-flow';
import type { SafeUserOpArgs } from '../userop';
import { createPhraseStore, PHRASE_OVERWRITE_MESSAGE, type SecureStoreLike } from '../phrase-store';
import { loadPasskeySession, PASSKEY_SESSION_KEY, WORDS_KEY_PLACEHOLDER } from '../session';
import { predictEcdsaSafeAddress } from '../ecdsa-safe';
import vector from './passkey-safe-vector.json';
import wordsVector from './words-recovery-vector.json';
import { deriveWordAddresses, wordsVaultKey } from '../words';
import { NO_WORDS_ACCOUNT_MESSAGE } from '../words-recovery';
import { encodeCreateSigner, encodeExecuteRecovery, encodeFinalizeRecovery, recoveryApprovalTypedData } from '../guardians';
import { recoverAddress, recoverTypedDataAddress } from 'viem';
import { NO_BIOMETRICS_MESSAGE } from '../phrase-store';
import { onPhraseUnavailable } from '../phrase-events';

const x = vector.x as Hex;
const y = vector.y as Hex;
const WALLET = getAddress('0x1111111111111111111111111111111111111111');
const LEGACY = getAddress('0x2222222222222222222222222222222222222222');
const SIGNER = getAddress('0x3333333333333333333333333333333333333333');
const OTHER = getAddress('0x4444444444444444444444444444444444444444');
const OLD_OWNER = getAddress('0x94a4F6affBd8975951142c3999aEAB7ecee555c2');
const NOW = 1_800_000_000;

/** expo-secure-store in memory (no prompts): enough for the phrase store's write / read / flags. */
function memSecure(o: { canBio?: boolean; readThrows?: string } = {}) {
  const m = new Map<string, string>();
  const secure = {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
    getItemAsync: jest.fn(async (k: string, opts?: { requireAuthentication?: boolean }) => {
      if (opts?.requireAuthentication && o.readThrows) throw new Error(o.readThrows);
      return m.get(k) ?? null;
    }),
    setItemAsync: jest.fn(async (k: string, v: string) => void m.set(k, v)),
    deleteItemAsync: jest.fn(async (k: string) => void m.delete(k)),
    canUseBiometricAuthentication: () => o.canBio ?? true,
  };
  return { m, secure, store: createPhraseStore(secure as unknown as SecureStoreLike) };
}

const hex = (h: string) => Uint8Array.from(Buffer.from(h, 'hex'));
/** The phrase of entropy 0x7f × 16 (BIP-39 test vector). */
const LEGAL = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
const JUNK = 'test test test test test test test test test test test junk';

const noRequest: RecoveryRequest = { guardiansApprovalCount: 0n, newThreshold: 0n, executeAfter: 0n, newOwners: [] };

function memStorage(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return {
    map: m,
    getItem: jest.fn(async (k: string) => m.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => void m.set(k, v)),
    removeItem: jest.fn(async (k: string) => void m.delete(k)),
  };
}

function makeDeps(over: Partial<RecoveryDeps> = {}) {
  const storage = memStorage();
  const sessionStorage = memStorage();
  const phrase = memSecure();
  const sent: SafeUserOpArgs[] = [];
  let request: RecoveryRequest = noRequest;
  let owners: Address[] = [OLD_OWNER];
  let approvals = 0n;
  const deps: RecoveryDeps = {
    storage,
    createPasskey: jest.fn(async () => ({ credentialId: 'cred-1', x, y, prfSupported: true })),
    getSigner: jest.fn(async () => SIGNER),
    readThreshold: jest.fn(async () => 2n),
    readApprovals: jest.fn(async () => approvals),
    readRequest: jest.fn(async () => request),
    readOwners: jest.fn(async () => owners),
    isSafeDeployed: jest.fn(async () => false),
    sendUserOp: jest.fn(async (a: SafeUserOpArgs) => {
      sent.push(a);
      return { userOpHash: '0x01' as Hex, txHash: '0x02' as Hex };
    }),
    signPasskey: jest.fn(async () => Promise.reject(new Error('no passkey prompt in these tests'))),
    phrase: phrase.store,
    sessionStorage,
    now: () => NOW,
    ...over,
  };
  return {
    deps,
    storage,
    sessionStorage,
    secure: phrase,
    sent,
    setRequest: (r: RecoveryRequest) => (request = r),
    setOwners: (o: Address[]) => (owners = o),
    setApprovals: (n: bigint) => (approvals = n),
  };
}

const srmFn = (data: Hex) => decodeFunctionData({ abi: socialRecoveryAbi, data });

async function waiting(h: ReturnType<typeof makeDeps>): Promise<RecoveryState> {
  return (await startRecovery({ wallet: WALLET, name: 'Erna', recoveryLegacy: LEGACY }, h.deps)).state;
}

describe('startRecovery', () => {
  it('creates the passkey, resolves its signer and persists waitingForGuardians', async () => {
    const h = makeDeps();
    const s = await waiting(h);
    expect(s.step).toBe('waitingForGuardians');
    expect(s.signer).toBe(SIGNER);
    expect(s.newSafe).toBe(predictSafeAddress({ x, y }));
    expect(h.deps.createPasskey).toHaveBeenCalledWith('Erna');
    expect(await loadRecoveryState(h.storage)).toEqual(s);
  });

  it('a user cancelling the passkey sheet returns idle and persists nothing', async () => {
    const h = makeDeps({ createPasskey: jest.fn(async () => Promise.reject(new PasskeyCancelledError())) });
    const s = await waiting(h);
    expect(s.step).toBe('idle');
    expect(s.message).toMatch(/Abgebrochen/);
    expect(h.storage.map.has(RECOVERY_STORE_KEY)).toBe(false);
  });

  it('an unsupported device is an error and persists nothing', async () => {
    const h = makeDeps({ createPasskey: jest.fn(async () => Promise.reject(new PasskeyNotSupportedError())) });
    const s = await waiting(h);
    expect(s.step).toBe('error');
    expect(h.storage.map.has(RECOVERY_STORE_KEY)).toBe(false);
  });

  it('a signer read failure keeps the created passkey persisted; resume reuses it', async () => {
    const getSigner = jest.fn().mockRejectedValueOnce(new Error('rpc down')).mockResolvedValue(SIGNER);
    const h = makeDeps({ getSigner });
    const s = await waiting(h);
    expect(s.step).toBe('error');
    expect(s.credentialId).toBe('cred-1');
    const persisted = (await loadRecoveryState(h.storage))!;
    const r = await resumeRecovery(persisted, h.deps);
    expect(r.step).toBe('waitingForGuardians');
    expect(r.signer).toBe(SIGNER);
    expect(h.deps.createPasskey).toHaveBeenCalledTimes(1);
  });
});

describe('waitingForGuardians', () => {
  it('stays waiting below the threshold and reports progress', async () => {
    const h = makeDeps();
    const s = await waiting(h);
    h.setApprovals(1n);
    const p = await pollRecovery(s, h.deps);
    expect(p.step).toBe('waitingForGuardians');
    expect(p.approvals).toBe(1);
    expect(p.threshold).toBe(2);
    expect(h.deps.readApprovals).toHaveBeenCalledWith(WALLET, [SIGNER], 1);
  });

  it('threshold reached → executing, then one sponsored op [createSigner, executeRecovery] from the new Safe', async () => {
    const h = makeDeps();
    const s = await waiting(h);
    h.setApprovals(2n);
    const p = await pollRecovery(s, h.deps);
    expect(p.step).toBe('executing');

    h.deps.sendUserOp = jest.fn(async (a: SafeUserOpArgs) => {
      h.sent.push(a);
      h.setRequest({ guardiansApprovalCount: 2n, newThreshold: 1n, executeAfter: BigInt(NOW + 259200), newOwners: [SIGNER] });
      return { userOpHash: '0x01' as Hex, txHash: '0x02' as Hex };
    });
    const e = await executeRecoveryStep(p, h.deps);
    expect(e.step).toBe('waitingDelay');
    expect(e.executeAfter).toBe(NOW + 259200);
    const op = h.sent[0];
    expect(op.signer.proof).toEqual({ x, y });
    expect(op.signer.predicted).toBe(predictSafeAddress({ x, y }));
    expect(op.legacy).toBeUndefined();
    expect(op.recoveryLegacy).toBe(LEGACY);
    expect(op.sender).toBeUndefined(); // the predicted passkey Safe of (x, y)
    expect(op.deployed).toBe(false);
    expect(op.calls[0].to).toBe(SAFE_WEBAUTHN_SIGNER_FACTORY);
    expect(op.calls[1].to).toBe(SOCIAL_RECOVERY_MODULE);
    const d = srmFn(op.calls[1].data);
    expect(d.functionName).toBe('executeRecovery');
    expect(d.args).toEqual([WALLET, [SIGNER], 1n]);
  });

  it('a guardian who already executed (request for my signer) jumps to waitingDelay', async () => {
    const h = makeDeps();
    const s = await waiting(h);
    h.setRequest({ guardiansApprovalCount: 2n, newThreshold: 1n, executeAfter: BigInt(NOW + 100), newOwners: [SIGNER] });
    const p = await pollRecovery(s, h.deps);
    expect(p.step).toBe('waitingDelay');
    expect(p.executeAfter).toBe(NOW + 100);
  });

  it("someone else's pending recovery blocks with a message, no transition", async () => {
    const h = makeDeps();
    const s = await waiting(h);
    h.setRequest({ guardiansApprovalCount: 2n, newThreshold: 1n, executeAfter: BigInt(NOW + 100), newOwners: [OTHER] });
    const p = await pollRecovery(s, h.deps);
    expect(p.step).toBe('waitingForGuardians');
    expect(p.message).toMatch(/andere Wiederherstellung/);
  });

  it('a cancelled fingerprint during execute keeps executing (retry possible)', async () => {
    const h = makeDeps({ sendUserOp: jest.fn(async () => Promise.reject(new PasskeyCancelledError())) });
    const s = { ...(await waiting(h)), step: 'executing' as const };
    const e = await executeRecoveryStep(s, h.deps);
    expect(e.step).toBe('executing');
    expect(e.message).toMatch(/Abgebrochen/);
  });

  it('a read failure is transient', async () => {
    const h = makeDeps();
    const s = await waiting(h);
    h.deps.readRequest = jest.fn(async () => Promise.reject(new Error('timeout')));
    const p = await pollRecovery(s, h.deps);
    expect(p.step).toBe('waitingForGuardians');
    expect(p.message).toMatch(/Keine Verbindung/);
  });
});

describe('waitingDelay → finalize', () => {
  async function delayed(h: ReturnType<typeof makeDeps>, executeAfter: number): Promise<RecoveryState> {
    const s = await waiting(h);
    h.setRequest({ guardiansApprovalCount: 2n, newThreshold: 1n, executeAfter: BigInt(executeAfter), newOwners: [SIGNER] });
    return pollRecovery(s, h.deps);
  }

  it('finalize too early: stays waitingDelay; finalizeRecoveryStep refuses to submit', async () => {
    const h = makeDeps();
    const s = await delayed(h, NOW + 3600);
    const p = await pollRecovery(s, h.deps);
    expect(p.step).toBe('waitingDelay');
    const f = await finalizeRecoveryStep({ ...p, step: 'finalizing' }, h.deps);
    expect(f.step).toBe('waitingDelay');
    expect(h.deps.sendUserOp).not.toHaveBeenCalled();
  });

  it('after the delay: finalizing → finalizeRecovery op → recovered record saved → done', async () => {
    const h = makeDeps({ isSafeDeployed: jest.fn(async () => true) });
    const s = await delayed(h, NOW - 1);
    expect(s.step).toBe('waitingDelay');
    const p = await pollRecovery(s, h.deps);
    expect(p.step).toBe('finalizing');
    const f = await finalizeRecoveryStep(p, h.deps);
    expect(f.step).toBe('done');
    const op = h.sent[0];
    expect(op.deployed).toBe(true);
    expect(srmFn(op.calls[0].data).functionName).toBe('finalizeRecovery');
    const rec = await loadMigrationRecord(h.storage);
    expect(rec).toMatchObject({ safe: WALLET, owner: SIGNER, ownerType: 'webauthnSigner', legacy: LEGACY, credentialId: 'cred-1' });
    expect(h.storage.map.has(MIGRATION_STORE_KEY)).toBe(true);
  });

  it('cancel detected: the request disappears and the owners are unchanged → cancelled', async () => {
    const h = makeDeps();
    const s = await delayed(h, NOW + 3600);
    h.setRequest(noRequest);
    const p = await pollRecovery(s, h.deps);
    expect(p.step).toBe('cancelled');
    expect((await loadRecoveryState(h.storage))!.step).toBe('cancelled');
    expect(await loadMigrationRecord(h.storage)).toBeNull();
  });

  it('someone else finalized: the request is gone but the owner is my signer → done', async () => {
    const h = makeDeps();
    const s = await delayed(h, NOW - 1);
    h.setRequest(noRequest);
    h.setOwners([SIGNER]);
    const p = await pollRecovery(s, h.deps);
    expect(p.step).toBe('done');
    expect((await loadMigrationRecord(h.storage))!.owner).toBe(SIGNER);
  });
});

describe('resume from persisted state', () => {
  it('a restarted app continues polling where it left off', async () => {
    const h = makeDeps();
    const s = await waiting(h);
    h.setRequest({ guardiansApprovalCount: 2n, newThreshold: 1n, executeAfter: BigInt(NOW + 10), newOwners: [SIGNER] });
    await pollRecovery(s, h.deps);

    // "app restart": only storage survives
    const restored = (await loadRecoveryState(h.storage))!;
    expect(restored.step).toBe('waitingDelay');
    expect(restored.credentialId).toBe('cred-1');
    const later = await pollRecovery(restored, { ...h.deps, now: () => NOW + 11 });
    expect(later.step).toBe('finalizing');
  });

  it('resumeRecovery on an error after execute goes back to waitingDelay', async () => {
    const h = makeDeps();
    const s: RecoveryState = { ...(await waiting(h)), step: 'error', executeAfter: NOW + 5 };
    expect((await resumeRecovery(s, h.deps)).step).toBe('waitingDelay');
  });

  it('ignores a corrupt persisted value', async () => {
    const h = makeDeps();
    await h.storage.setItem(RECOVERY_STORE_KEY, '{not json');
    expect(await loadRecoveryState(h.storage)).toBeNull();
  });
});

describe('helpers', () => {
  it('formatRemaining', () => {
    expect(formatRemaining(2 * 86400 + 14 * 3600 + 5)).toBe('Noch 2 Tage, 14 Stunden');
    expect(formatRemaining(86400 + 3600)).toBe('Noch 1 Tag, 1 Stunde');
    expect(formatRemaining(5 * 3600)).toBe('Noch 5 Stunden');
    expect(formatRemaining(61)).toBe('Noch 2 Minuten');
    expect(formatRemaining(0)).toBe('Gleich geschafft');
  });

  it('isForeignRecoveryPending', () => {
    expect(isForeignRecoveryPending(null, OLD_OWNER)).toBe(false);
    expect(isForeignRecoveryPending(noRequest, OLD_OWNER)).toBe(false);
    const req = { guardiansApprovalCount: 2n, newThreshold: 1n, executeAfter: 5n, newOwners: [OTHER] };
    expect(isForeignRecoveryPending(req, OLD_OWNER)).toBe(true);
    expect(isForeignRecoveryPending({ ...req, newOwners: [OLD_OWNER] }, OLD_OWNER)).toBe(false);
  });
});

describe('startWordsRecovery', () => {
  const PHRASE = wordsVector.phrase;
  const POOL = deriveWordAddresses(PHRASE);
  const DELAY = BigInt(NOW + 259200);

  function wordsDeps(over: Partial<Parameters<typeof startWordsRecovery>[1]> = {}) {
    const h = makeDeps();
    let nonce = 0n;
    const saveVaultKey = jest.fn(async (_k: Hex, _w: Address) => undefined);
    h.deps.sendUserOp = jest.fn(async (a: SafeUserOpArgs) => {
      h.sent.push(a);
      h.setRequest({ guardiansApprovalCount: 2n, newThreshold: 1n, executeAfter: DELAY, newOwners: [SIGNER] });
      return { userOpHash: '0x01' as Hex, txHash: '0x02' as Hex };
    });
    const deps = {
      ...h.deps,
      readGuardians: jest.fn(async () => [OTHER, POOL[0], POOL[1]]),
      readNonce: jest.fn(async () => nonce),
      saveVaultKey,
      ...over,
    };
    return { ...h, deps, saveVaultKey, setNonce: (n: bigint) => (nonce = n) };
  }

  const start = (h: ReturnType<typeof wordsDeps>, phrase = PHRASE) =>
    startWordsRecovery({ wallet: WALLET, name: 'Erna', phrase }, h.deps);

  it('one op [createSigner, multiConfirmRecovery(execute)] from the fresh Safe, then waitingDelay', async () => {
    const h = wordsDeps();
    const s = await start(h);
    expect(s.step).toBe('waitingDelay');
    expect(s.executeAfter).toBe(Number(DELAY));
    expect(s.method).toBe('words');
    expect(s.wordsPool).toEqual(POOL);
    expect(h.sent).toHaveLength(1);
    const op = h.sent[0];
    expect(op.deployed).toBe(false);
    expect(op.sender).toBeUndefined();
    expect(op.signer.proof).toEqual({ x, y });
    expect(op.calls).toHaveLength(2);
    expect(op.calls[0]).toEqual(encodeCreateSigner(x, y));
    expect(op.calls[1].to).toBe(SOCIAL_RECOVERY_MODULE);
    const d = srmFn(op.calls[1].data);
    expect(d.functionName).toBe('multiConfirmRecovery');
    const [wallet, owners, threshold, sigs, execute] = d.args as [Address, Address[], bigint, { signer: Address; signature: Hex }[], boolean];
    expect([wallet, owners, threshold, execute]).toEqual([WALLET, [SIGNER], 1n, true]);
    expect(sigs.map((g) => g.signer).sort()).toEqual([POOL[0], POOL[1]].sort());
    expect(h.deps.readNonce).toHaveBeenCalledWith(WALLET);
  });

  it('I5: a migrated account keeps its legacy link (recoveryLegacy persisted and used for the op)', async () => {
    const h = wordsDeps();
    const s = await startWordsRecovery({ wallet: WALLET, name: 'Erna', phrase: PHRASE, recoveryLegacy: LEGACY }, h.deps);
    expect(s.step).toBe('waitingDelay');
    expect(s.recoveryLegacy).toBe(LEGACY);
    expect(JSON.parse(h.storage.map.get(RECOVERY_STORE_KEY)!).recoveryLegacy).toBe(LEGACY);
    expect(h.sent[0].recoveryLegacy).toBe(LEGACY);
  });

  it('saves the words vault key before the op and never persists the words', async () => {
    const h = wordsDeps();
    await start(h);
    expect(h.saveVaultKey).toHaveBeenCalledWith(wordsVaultKey(PHRASE), WALLET);
    expect(h.saveVaultKey.mock.invocationCallOrder[0]).toBeLessThan((h.deps.sendUserOp as jest.Mock).mock.invocationCallOrder[0]);
    const persisted = h.storage.map.get(RECOVERY_STORE_KEY)!;
    expect(persisted).toBeTruthy();
    for (const w of PHRASE.split(' ')) expect(persisted).not.toContain(w);
  });

  it('a cancelled passkey sheet returns idle and sends nothing', async () => {
    const h = wordsDeps({ createPasskey: jest.fn(async () => Promise.reject(new PasskeyCancelledError())) });
    const s = await start(h);
    expect(s.step).toBe('idle');
    expect(h.sent).toHaveLength(0);
    expect(h.saveVaultKey).not.toHaveBeenCalled();
    expect(h.storage.map.has(RECOVERY_STORE_KEY)).toBe(false);
  });

  it('a typo is caught before any passkey is created', async () => {
    const h = wordsDeps();
    const s = await start(h, PHRASE.replace('junk', 'test'));
    expect(s.step).toBe('idle');
    expect(s.message).toMatch(/passen nicht zusammen/);
    expect(h.deps.createPasskey).not.toHaveBeenCalled();
    expect(h.sent).toHaveLength(0);
  });

  it('words removed from the account (or too few for the threshold): says so and creates nothing', async () => {
    for (const guardians of [[OTHER], [OTHER, POOL[0]]]) {
      const h = wordsDeps({ readGuardians: jest.fn(async () => guardians) });
      const s = await start(h);
      expect(s.step).toBe('idle');
      expect(s.message).toBe(NO_WORDS_ACCOUNT_MESSAGE);
      expect(h.deps.createPasskey).not.toHaveBeenCalled();
      expect(h.saveVaultKey).not.toHaveBeenCalled();
      expect(h.storage.map.has(RECOVERY_STORE_KEY)).toBe(false);
    }
  });

  it('owner cancels → cancelled; a new attempt signs the moved nonce (old approvals are dead)', async () => {
    const h = wordsDeps();
    const first = await start(h);
    const firstSigs = (srmFn(h.sent[0].calls[1].data).args[3] as { signer: Address; signature: Hex }[]).map((g) => g.signature);
    // The owner cancels: the request disappears, owners unchanged, the module nonce moved.
    h.setRequest(noRequest);
    h.setNonce(1n);
    expect((await pollRecovery(first, h.deps)).step).toBe('cancelled');

    const again = await start(h);
    expect(again.step).toBe('waitingDelay');
    const sigs = srmFn(h.sent[1].calls[1].data).args[3] as { signer: Address; signature: Hex }[];
    for (const g of sigs) {
      expect(firstSigs).not.toContain(g.signature);
      const signer = await recoverTypedDataAddress({ ...recoveryApprovalTypedData(WALLET, [SIGNER], 1, 1n), signature: g.signature });
      expect(signer).toBe(g.signer);
    }
  });

  it('reaching done calls wordsDone once (pool + pending key restore); a guardian recovery does not', async () => {
    const wordsDone = jest.fn(async () => undefined);
    const h = wordsDeps({ wordsDone });
    const s = await start(h);
    h.setOwners([SIGNER]);
    const fin = await finalizeRecoveryStep({ ...s, step: 'finalizing', executeAfter: NOW - 1 }, h.deps);
    expect(fin.step).toBe('done');
    expect(wordsDone).toHaveBeenCalledTimes(1);
    expect(wordsDone.mock.calls[0][0]).toMatchObject({ wallet: WALLET, method: 'words', wordsPool: POOL, signer: SIGNER });

    const g = makeDeps({ wordsDone });
    const { state: gs } = await startRecovery({ wallet: WALLET, name: 'Erna' }, g.deps);
    await finalizeRecoveryStep({ ...gs, step: 'finalizing', executeAfter: NOW - 1 }, g.deps);
    expect(wordsDone).toHaveBeenCalledTimes(1);
  });

  it('a failed op keeps the passkey; after resume the words are asked again and the same passkey is reused', async () => {
    const h = wordsDeps();
    h.deps.sendUserOp = jest.fn(async () => Promise.reject(new Error('bundler down')));
    const s = await start(h);
    expect(s.step).toBe('error');
    const persisted = (await loadRecoveryState(h.storage))!;
    const r = await resumeRecovery(persisted, h.deps);
    expect(r.step).toBe('idle');
    expect(r.method).toBe('words');
    h.deps.sendUserOp = jest.fn(async (a: SafeUserOpArgs) => {
      h.sent.push(a);
      h.setRequest({ guardiansApprovalCount: 2n, newThreshold: 1n, executeAfter: DELAY, newOwners: [SIGNER] });
      return { userOpHash: '0x01' as Hex, txHash: '0x02' as Hex };
    });
    const ok = await start(h);
    expect(ok.step).toBe('waitingDelay');
    expect(h.deps.createPasskey).toHaveBeenCalledTimes(1);
    expect(ok.credentialId).toBe('cred-1');
  });
});


describe('expert account (ownerKind ecdsa): guardians recover it to NEW 12 words', () => {
  const NEW_OWNER = deriveWordAddresses(LEGAL, 1)[0];
  const NEW_SAFE = predictEcdsaSafeAddress(NEW_OWNER);
  const OP_HASH = `0x${'11'.repeat(32)}` as Hex;

  /** Deps whose sendUserOp also signs (so the device unlock + the words' key really run). */
  function expertDeps(over: Partial<RecoveryDeps> = {}) {
    const h = makeDeps({ random: () => hex('7f'.repeat(16)), ...over });
    const sigs: Hex[] = [];
    h.deps.sendUserOp = jest.fn(async (a: SafeUserOpArgs) => {
      sigs.push(await a.signer.signOpHash(OP_HASH));
      h.sent.push(a);
      return { userOpHash: '0x01' as Hex, txHash: '0x02' as Hex };
    });
    return { ...h, sigs };
  }

  const startExpert = (h: ReturnType<typeof expertDeps>) =>
    startRecovery({ wallet: WALLET, name: 'Anna', ownerKind: 'ecdsa' }, h.deps);

  it('start generates and stores a new phrase, no passkey; the state holds no word', async () => {
    const h = expertDeps();
    const { state, phrase } = await startExpert(h);
    expect(phrase).toBe(LEGAL);
    expect(state).toMatchObject({ step: 'waitingForGuardians', ownerKind: 'ecdsa', signer: NEW_OWNER, newSafe: NEW_SAFE });
    expect(state.credentialId).toBeUndefined();
    expect(h.deps.createPasskey).not.toHaveBeenCalled();
    expect(h.deps.getSigner).not.toHaveBeenCalled();
    expect(await loadRecoveryState(h.storage)).toEqual(state);
    const persisted = h.storage.map.get(RECOVERY_STORE_KEY)!;
    for (const w of LEGAL.split(' ')) expect(persisted).not.toContain(w);
    // Stored behind the device unlock, not yet confirmed.
    expect(await h.deps.phrase.storedOwner()).toBe(NEW_OWNER);
    expect(await h.deps.phrase.read('x')).toBe(LEGAL);
    expect(await h.deps.phrase.isConfirmed()).toBe(false);
    expect(await recoveryWordsStatus(state, h.deps.phrase)).toBe('unconfirmed');
  });

  it("E4: the unconfirmed words of another account on this phone are never replaced", async () => {
    const h = expertDeps();
    await h.deps.phrase.write(JUNK);
    const { state, phrase } = await startExpert(h);
    expect(phrase).toBeUndefined();
    expect(state.step).toBe('idle');
    expect(state.message).toBe(PHRASE_OVERWRITE_MESSAGE);
    expect(h.storage.map.has(RECOVERY_STORE_KEY)).toBe(false);
    expect(await h.deps.phrase.read('x')).toBe(JUNK);
  });

  it('a phone without biometrics: says so, stores and persists nothing', async () => {
    const noBio = memSecure({ canBio: false });
    const h = expertDeps({ phrase: noBio.store });
    const { state, phrase } = await startExpert(h);
    expect(phrase).toBeUndefined();
    expect(state.message).toBe(NO_BIOMETRICS_MESSAGE);
    expect(noBio.m.size).toBe(0);
    expect(h.storage.map.has(RECOVERY_STORE_KEY)).toBe(false);
  });

  it('the execute op is ONE call from the fresh expert Safe, signed by the new words', async () => {
    const h = expertDeps();
    const { state } = await startExpert(h);
    const s = await executeRecoveryStep({ ...state, step: 'executing' }, h.deps);
    expect(h.deps.sendUserOp).toHaveBeenCalledTimes(1);
    const args = (h.deps.sendUserOp as jest.Mock).mock.calls[0][0] as SafeUserOpArgs;
    expect(args.calls).toEqual([encodeExecuteRecovery(WALLET, [NEW_OWNER], 1)]);
    expect(args.signer.proof).toEqual({ ecdsaOwner: NEW_OWNER });
    expect(args.signer.predicted).toBe(NEW_SAFE);
    expect(args.sender).toBeUndefined();
    expect(args.deployed).toBe(false);
    expect(args.legacy).toBeUndefined();
    // The userOp signature = validity window ++ the new words' key 0 over the op hash.
    const sig = h.sigs[0];
    expect(await recoverAddress({ hash: OP_HASH, signature: `0x${sig.slice(2 + 24)}` })).toBe(NEW_OWNER);
    expect(s.step).toBe('waitingDelay');
  });

  it('a dismissed device unlock during execute keeps executing (retry possible)', async () => {
    const h = expertDeps();
    const { state } = await startExpert(h);
    h.secure.secure.getItemAsync.mockImplementation(async (k: string, opts?: { requireAuthentication?: boolean }) => {
      if (opts?.requireAuthentication) throw new Error('User canceled the authentication');
      return h.secure.m.get(k) ?? null;
    });
    const s = await executeRecoveryStep({ ...state, step: 'executing' }, h.deps);
    expect(s.step).toBe('executing');
    expect(s.message).toMatch(/Abgebrochen/);
  });

  it('new words made unreadable (biometrics changed): says so, stays executing, no app-wide re-entry route', async () => {
    const h = expertDeps();
    const { state } = await startExpert(h);
    h.secure.m.delete('words_phrase_v1'); // the system invalidated the protected item: it reads back as null
    const heard = jest.fn();
    const off = onPhraseUnavailable(heard);
    try {
      const s = await executeRecoveryStep({ ...state, step: 'executing' }, h.deps);
      expect(s.step).toBe('executing');
      expect(s.message).toMatch(/gesperrt/);
      expect(heard).not.toHaveBeenCalled();
    } finally {
      off();
    }
  });

  it('finalize saves a words record AND session on the OLD Safe address', async () => {
    const h = expertDeps();
    const { state } = await startExpert(h);
    const f = await finalizeRecoveryStep({ ...state, step: 'finalizing', executeAfter: NOW - 1 }, h.deps);
    expect(f.step).toBe('done');
    const args = (h.deps.sendUserOp as jest.Mock).mock.calls[0][0] as SafeUserOpArgs;
    expect(args.calls).toEqual([encodeFinalizeRecovery(WALLET)]);
    expect(args.deployed).toBe(true);
    expect(args.signer.proof).toEqual({ ecdsaOwner: NEW_OWNER });
    expect(await loadPasskeySession(h.sessionStorage)).toMatchObject({
      safe: WALLET,
      identity: WALLET,
      owner: NEW_OWNER,
      ownerType: 'ecdsa',
      credentialId: '',
      x: WORDS_KEY_PLACEHOLDER,
      y: WORDS_KEY_PLACEHOLDER,
    });
    expect(await loadMigrationRecord(h.storage)).toMatchObject({ safe: WALLET, owner: NEW_OWNER, ownerType: 'ecdsa', status: 'done' });
    expect(h.storage.map.has(MIGRATION_STORE_KEY)).toBe(true);
  });

  it('someone else finalized: the poll ends in done with the words session', async () => {
    const h = expertDeps();
    const { state } = await startExpert(h);
    h.setOwners([NEW_OWNER]);
    const p = await pollRecovery({ ...state, step: 'waitingDelay', executeAfter: NOW - 1 }, h.deps);
    expect(p.step).toBe('done');
    expect(h.deps.sendUserOp).not.toHaveBeenCalled();
    expect((await loadPasskeySession(h.sessionStorage))?.owner).toBe(NEW_OWNER);
    expect(h.sessionStorage.map.has(PASSKEY_SESSION_KEY)).toBe(true);
  });

  it('resume after an error goes back to waiting (no passkey needed)', async () => {
    const h = expertDeps();
    const { state } = await startExpert(h);
    expect((await resumeRecovery({ ...state, step: 'error' }, h.deps)).step).toBe('waitingForGuardians');
    expect((await resumeRecovery({ ...state, step: 'error', executeAfter: NOW + 5 }, h.deps)).step).toBe('waitingDelay');
  });

  it('abandoning before the words were confirmed removes them; confirmed words stay', async () => {
    const h = expertDeps();
    const { state } = await startExpert(h);
    await abandonRecovery(state, h.deps);
    expect(await h.deps.phrase.has()).toBe(false);
    expect(h.storage.map.has(RECOVERY_STORE_KEY)).toBe(false);

    // A new attempt is not blocked (E4) and, once confirmed, its words survive "neu beginnen".
    const again = await startExpert(h);
    expect(again.phrase).toBe(LEGAL);
    await h.deps.phrase.markConfirmed();
    expect(await recoveryWordsStatus(again.state, h.deps.phrase)).toBe('confirmed');
    await abandonRecovery(again.state, h.deps);
    expect(await h.deps.phrase.storedOwner()).toBe(NEW_OWNER);
  });

  it('words replaced by another account are reported as missing; a passkey recovery is always confirmed', async () => {
    const h = expertDeps();
    const { state } = await startExpert(h);
    await h.deps.phrase.markConfirmed();
    await h.deps.phrase.write(JUNK);
    expect(await recoveryWordsStatus(state, h.deps.phrase)).toBe('missing');
    const g = makeDeps();
    expect(await recoveryWordsStatus(await waiting(g), g.deps.phrase)).toBe('confirmed');
  });

  it('ownerKindForCode: no code or a 7702 designator = expert owner (E9); other code = passkey', () => {
    expect(ownerKindForCode(undefined)).toBe('ecdsa');
    expect(ownerKindForCode('0x')).toBe('ecdsa');
    expect(ownerKindForCode(`0xef0100${'ab'.repeat(20)}` as Hex)).toBe('ecdsa');
    expect(ownerKindForCode(`0xef0100${'ab'.repeat(21)}` as Hex)).toBe('passkey');
    expect(ownerKindForCode('0x6080604052' as Hex)).toBe('passkey');
  });
});
