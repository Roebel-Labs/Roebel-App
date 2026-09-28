jest.mock('react-native-passkey', () => ({ Passkey: { create: jest.fn(), get: jest.fn(), isSupported: () => true } }));

import { decodeFunctionData, getAddress, type Hex } from 'viem';
import { socialRecoveryAbi } from '../guardians';
import { SOCIAL_RECOVERY_MODULE, SOCIAL_RECOVERY_SENTINEL } from '../constants';
import {
  HELPER_CONFIRMED,
  HELPER_IDLE,
  HELPER_NOT_GUARDIAN,
  HELPER_SELF,
  helperBusy,
  helperDisplay,
  helperLabel,
  helperReducer,
  maskEmail,
  parseHelpers,
  planAddRecoveryHelper,
  planHelperConfirm,
  withHelper,
  type HelperEvent,
  type HelperState,
} from '../recovery-helper';

const A = getAddress('0x00000000000000000000000000000000000000a1');
const B = getAddress('0x00000000000000000000000000000000000000b2');
const HELPER = getAddress('0x00000000000000000000000000000000000000c3');
const WALLET = getAddress('0x00000000000000000000000000000000000000ff');
const LEGACY = getAddress('0x00000000000000000000000000000000000000ee');
const SIGNER = getAddress('0x00000000000000000000000000000000000000dd');

const decode = (data: Hex) => decodeFunctionData({ abi: socialRecoveryAbi, data });

describe('planAddRecoveryHelper — threshold rule', () => {
  it('the only guardian gets threshold 1 and the delay explanation', () => {
    const p = planAddRecoveryHelper({ wallet: WALLET, legacy: LEGACY, current: [], currentThreshold: 0, helper: HELPER });
    expect(p.kind).toBe('add');
    if (p.kind !== 'add') return;
    expect(p.threshold).toBe(1);
    expect(p.onlyGuardian).toBe(true);
    expect(p.calls).toHaveLength(1);
    expect(p.calls[0].to).toBe(SOCIAL_RECOVERY_MODULE);
    const d = decode(p.calls[0].data);
    expect(d.functionName).toBe('addGuardianWithThreshold');
    expect(d.args).toEqual([HELPER, 1n]);
  });

  it('keeps the user threshold when there are other guardians', () => {
    const p = planAddRecoveryHelper({ wallet: WALLET, current: [A, B], currentThreshold: 2, helper: HELPER });
    expect(p.kind === 'add' && p.threshold).toBe(2);
    expect(p.kind === 'add' && p.onlyGuardian).toBe(false);
    if (p.kind === 'add') expect(decode(p.calls[0].data).args).toEqual([HELPER, 2n]);
    const one = planAddRecoveryHelper({ wallet: WALLET, current: [A], currentThreshold: 1, helper: HELPER });
    expect(one.kind === 'add' && one.threshold).toBe(1); // never raised
  });

  it('clamps a broken stored threshold into [1, count]', () => {
    const zero = planAddRecoveryHelper({ wallet: WALLET, current: [A], currentThreshold: 0, helper: HELPER });
    expect(zero.kind === 'add' && zero.threshold).toBe(1);
    const high = planAddRecoveryHelper({ wallet: WALLET, current: [A], currentThreshold: 9, helper: HELPER });
    expect(high.kind === 'add' && high.threshold).toBe(2);
  });

  it('refuses the wallet itself and its legacy account (that is the person, not a helper)', () => {
    expect(planAddRecoveryHelper({ wallet: WALLET, current: [], currentThreshold: 0, helper: WALLET }).kind).toBe('self');
    expect(planAddRecoveryHelper({ wallet: WALLET, legacy: LEGACY, current: [], currentThreshold: 0, helper: LEGACY }).kind).toBe('self');
  });

  it('refuses an existing guardian (case-insensitive) and reserved addresses', () => {
    expect(
      planAddRecoveryHelper({ wallet: WALLET, current: [HELPER], currentThreshold: 1, helper: HELPER.toLowerCase() as `0x${string}` }).kind,
    ).toBe('exists');
    expect(planAddRecoveryHelper({ wallet: WALLET, current: [], currentThreshold: 0, helper: SOCIAL_RECOVERY_SENTINEL }).kind).toBe('invalid');
    expect(
      planAddRecoveryHelper({ wallet: WALLET, current: [], currentThreshold: 0, helper: '0x0000000000000000000000000000000000000000' }).kind,
    ).toBe('invalid');
    expect(planAddRecoveryHelper({ wallet: WALLET, current: [], currentThreshold: 0, helper: '0x123' as `0x${string}` }).kind).toBe('invalid');
  });
});

describe('labels', () => {
  it('names the helper by login kind', () => {
    expect(helperLabel('google')).toBe('Google-Konto (Helfer)');
    expect(helperLabel('email')).toBe('E-Mail-Konto (Helfer)');
    expect(helperLabel('apple')).toBe('Apple-Konto (Helfer)');
    expect(helperDisplay({ kind: 'google', masked: 'm•••h@gmail.com' })).toEqual({
      name: 'Google-Konto (Helfer)',
      detail: 'm•••h@gmail.com',
    });
    expect(helperDisplay({ kind: 'email', masked: null })).toEqual({ name: 'E-Mail-Konto (Helfer)', detail: null });
  });

  it('masks emails and never returns the raw address', () => {
    expect(maskEmail('max.brych@Gmail.com')).toBe('m•••h@gmail.com');
    expect(maskEmail('ab@web.de')).toBe('a•••@web.de');
    expect(maskEmail('a@web.de')).toBe('a•••@web.de');
    expect(maskEmail('  x.y.z@posteo.de ')).toBe('x•••z@posteo.de');
    expect(maskEmail('')).toBeNull();
    expect(maskEmail(null)).toBeNull();
    expect(maskEmail('no-at-sign')).toBeNull();
    expect(maskEmail('@domain.de')).toBeNull();
    expect(maskEmail('name@')).toBeNull();
    expect(maskEmail('max.brych@gmail.com')).not.toContain('brych');
  });

  it('stores helpers by lower-case address and drops junk on parse', () => {
    const stored = withHelper({}, HELPER, { kind: 'google', masked: 'm•••h@gmail.com' });
    expect(Object.keys(stored)).toEqual([HELPER.toLowerCase()]);
    expect(parseHelpers(JSON.stringify(stored))).toEqual(stored);
    expect(
      parseHelpers(
        JSON.stringify({
          ...stored,
          '0xnotanaddress': { kind: 'google', masked: null },
          [A.toLowerCase()]: { kind: 'phone', masked: null },
          [B.toLowerCase()]: { kind: 'email', masked: 42 },
        }),
      ),
    ).toEqual({ ...stored, [B.toLowerCase()]: { kind: 'email', masked: null } });
    expect(parseHelpers('not json')).toEqual({});
    expect(parseHelpers(null)).toEqual({});
    expect(parseHelpers('[1,2]')).toEqual({});
  });
});

describe('planHelperConfirm', () => {
  it('confirms newOwners = [signer], threshold 1, execute = false', () => {
    const p = planHelperConfirm({ wallet: WALLET, signer: SIGNER, guardians: [A, HELPER], helper: HELPER });
    expect(p.kind).toBe('confirm');
    if (p.kind !== 'confirm') return;
    expect(p.call.to).toBe(SOCIAL_RECOVERY_MODULE);
    const d = decode(p.call.data);
    expect(d.functionName).toBe('confirmRecovery');
    expect(d.args).toEqual([WALLET, [SIGNER], 1n, false]);
  });
  it('refuses a login that is not a guardian, or the wallet itself', () => {
    expect(planHelperConfirm({ wallet: WALLET, signer: SIGNER, guardians: [A], helper: HELPER }).kind).toBe('notGuardian');
    expect(planHelperConfirm({ wallet: WALLET, signer: SIGNER, guardians: [WALLET], helper: WALLET }).kind).toBe('self');
  });
});

describe('helperReducer — the confirm step inside "Konto wiederherstellen"', () => {
  const run = (events: HelperEvent[], from: HelperState = HELPER_IDLE) => events.reduce(helperReducer, from);
  const confirmPlan = planHelperConfirm({ wallet: WALLET, signer: SIGNER, guardians: [HELPER], helper: HELPER });

  it('happy path: idle → signingIn → checking → confirming → confirmed', () => {
    const s1 = run([{ type: 'start' }]);
    expect(s1.step).toBe('signingIn');
    expect(helperBusy(s1)).toBe(true);
    const s2 = run([{ type: 'signedIn' }], s1);
    expect(s2.step).toBe('checking');
    const s3 = run([{ type: 'planned', plan: confirmPlan }], s2);
    expect(s3.step).toBe('confirming');
    const s4 = run([{ type: 'sent' }], s3);
    expect(s4).toEqual({ step: 'confirmed', message: HELPER_CONFIRMED });
    expect(helperBusy(s4)).toBe(false);
  });

  it('a cancelled login goes back to idle without an error', () => {
    expect(run([{ type: 'start' }, { type: 'cancelled' }])).toEqual(HELPER_IDLE);
  });

  it('not a guardian / self → failed with a German message; retry starts over', () => {
    const notG = run([{ type: 'start' }, { type: 'signedIn' }, { type: 'planned', plan: { kind: 'notGuardian' } }]);
    expect(notG).toEqual({ step: 'failed', message: HELPER_NOT_GUARDIAN });
    expect(run([{ type: 'start' }], notG).step).toBe('signingIn');
    const self = run([{ type: 'start' }, { type: 'signedIn' }, { type: 'planned', plan: { kind: 'self' } }]);
    expect(self.message).toBe(HELPER_SELF);
  });

  it('errors fail the step, but never undo a confirmation', () => {
    expect(run([{ type: 'start' }, { type: 'error' }]).step).toBe('failed');
    expect(run([{ type: 'start' }, { type: 'error', message: 'X' }]).message).toBe('X');
    const done = run([{ type: 'start' }, { type: 'signedIn' }, { type: 'planned', plan: confirmPlan }, { type: 'sent' }]);
    expect(run([{ type: 'error' }], done)).toBe(done);
    expect(run([{ type: 'cancelled' }], done)).toBe(done);
  });

  it('ignores events out of order (a second tap while busy does nothing)', () => {
    const s = run([{ type: 'start' }]);
    expect(run([{ type: 'start' }], s)).toBe(s);
    expect(run([{ type: 'sent' }], s)).toBe(s);
    expect(run([{ type: 'planned', plan: confirmPlan }], s)).toBe(s);
    expect(run([{ type: 'signedIn' }])).toEqual(HELPER_IDLE);
    expect(run([{ type: 'reset' }], s)).toEqual(HELPER_IDLE);
  });
});
