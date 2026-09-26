jest.mock('react-native-passkey', () => ({ Passkey: { create: jest.fn(), get: jest.fn(), isSupported: () => true } }));

import { decodeFunctionData, getAddress, type Address, type Hex } from 'viem';
import { PasskeyCancelledError, PasskeyNotSupportedError } from '../webauthn';
import { MIGRATION_STORE_KEY, loadMigrationRecord } from '../migration';
import { socialRecoveryAbi, type RecoveryRequest } from '../guardians';
import { SAFE_WEBAUTHN_SIGNER_FACTORY, SOCIAL_RECOVERY_MODULE } from '../constants';
import { predictSafeAddress } from '../safe-address';
import {
  RECOVERY_STORE_KEY,
  executeRecoveryStep,
  finalizeRecoveryStep,
  formatRemaining,
  isForeignRecoveryPending,
  loadRecoveryState,
  pollRecovery,
  resumeRecovery,
  startRecovery,
  type RecoveryDeps,
  type RecoveryState,
} from '../recovery-flow';
import type { PasskeyUserOpArgs } from '../userop';
import vector from './passkey-safe-vector.json';

const x = vector.x as Hex;
const y = vector.y as Hex;
const WALLET = getAddress('0x1111111111111111111111111111111111111111');
const LEGACY = getAddress('0x2222222222222222222222222222222222222222');
const SIGNER = getAddress('0x3333333333333333333333333333333333333333');
const OTHER = getAddress('0x4444444444444444444444444444444444444444');
const OLD_OWNER = getAddress('0x94a4F6affBd8975951142c3999aEAB7ecee555c2');
const NOW = 1_800_000_000;

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
  const sent: PasskeyUserOpArgs[] = [];
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
    sendPasskeyUserOp: jest.fn(async (a: PasskeyUserOpArgs) => {
      sent.push(a);
      return { userOpHash: '0x01' as Hex, txHash: '0x02' as Hex };
    }),
    now: () => NOW,
    ...over,
  };
  return {
    deps,
    storage,
    sent,
    setRequest: (r: RecoveryRequest) => (request = r),
    setOwners: (o: Address[]) => (owners = o),
    setApprovals: (n: bigint) => (approvals = n),
  };
}

const srmFn = (data: Hex) => decodeFunctionData({ abi: socialRecoveryAbi, data });

async function waiting(h: ReturnType<typeof makeDeps>): Promise<RecoveryState> {
  return startRecovery({ wallet: WALLET, name: 'Erna', recoveryLegacy: LEGACY }, h.deps);
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

    h.deps.sendPasskeyUserOp = jest.fn(async (a: PasskeyUserOpArgs) => {
      h.sent.push(a);
      h.setRequest({ guardiansApprovalCount: 2n, newThreshold: 1n, executeAfter: BigInt(NOW + 259200), newOwners: [SIGNER] });
      return { userOpHash: '0x01' as Hex, txHash: '0x02' as Hex };
    });
    const e = await executeRecoveryStep(p, h.deps);
    expect(e.step).toBe('waitingDelay');
    expect(e.executeAfter).toBe(NOW + 259200);
    const op = h.sent[0];
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
    const h = makeDeps({ sendPasskeyUserOp: jest.fn(async () => Promise.reject(new PasskeyCancelledError())) });
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
    expect(h.deps.sendPasskeyUserOp).not.toHaveBeenCalled();
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
