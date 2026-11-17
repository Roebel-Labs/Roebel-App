jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@/constants/gnosis', () => ({ credentialRegistryGnosisAddress: '0x' + '11'.repeat(20), credentialRegistryDeployBlock: 0 }));
jest.mock('@/lib/org-safe/send', () => ({ sendOrgCalls: jest.fn() }));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

import { credentialTypeId, encodeSteps, type RegisterStep } from '@netizen-labs/credential-registry';
import type { Hex } from 'viem';
import type { PhoneAction } from '../types';
import { orgIdFromUuid } from '@/lib/org-safe/ops';
import { currentDelegates } from '../delegates';
import {
  checkSummary,
  confirmAction,
  describeSteps,
  germanDateToIso,
  resolveActionOrg,
  reviewAction,
  safeServerText,
  submittedMessage,
  typeNamesFrom,
  type ConfirmDeps,
} from '../org';

const REG = ('0x' + '11'.repeat(20)) as `0x${string}`;
const OTHER_REG = ('0x' + '99'.repeat(20)) as `0x${string}`;
const ADDR = '0x' + 'ab'.repeat(20);
const account = { address: ADDR, signMessage: jest.fn(async () => '0x') } as any;
const b32 = (n: number) => ('0x' + n.toString(16).padStart(64, '0')) as Hex;
const ORG_UUID = '6f1c2c7e-0d3a-4b5e-9a51-3f7a1d2b9c10';
const OTHER_UUID = '11111111-2222-4333-8444-555555555555';
const ORG = orgIdFromUuid(ORG_UUID);
const OTHER_ORG = orgIdFromUuid(OTHER_UUID);
const ORGS = [{ accountId: ORG_UUID, name: 'Feuerwehr Röbel' }];
const TYPE = b32(7);
const BADGE = b32(8);
const TX = ('0x' + 'ee'.repeat(32)) as Hex;
const DELEGATE = ('0x' + 'cd'.repeat(20)) as `0x${string}`;
const HEX_ADDRESS = /0x[0-9a-fA-F]{6,}/;

const cfg = { metadataURI: 'https://www.roebel.app/m/1', defaultValidity: 0, claimStart: 0, claimEnd: 0, supplyCap: 0, publicClaim: true };

const names = (typeId: Hex) =>
  typeId === TYPE ? 'Feuerwehr' : typeId === BADGE ? 'Helfer:in' : typeId === credentialTypeId(ORG, b32(5)) ? 'Vorstand' : null;
const kinds = (typeId: Hex) => (typeId === BADGE ? 'badge' : typeId === TYPE ? 'membership' : null);

function action(over: Partial<PhoneAction> = {}): PhoneAction {
  return {
    id: '6f1c2c7e-0d3a-4b5e-9a51-3f7a1d2b9c10',
    status: 'awaiting_confirmation',
    steps: [{ fn: 'addBatch', typeId: TYPE, root: b32(1), count: 2 }],
    summary: { title: '2 Ausweise ausstellen: Feuerwehr', lines: [], orgName: 'Feuerwehr Röbel', counts: { app: 1, link: 1 } },
    registry: REG,
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
    ...over,
  };
}

function deps(over: Partial<ConfirmDeps> = {}): ConfirmDeps {
  return {
    configured: () => true,
    canManage: jest.fn(async () => true),
    canIssue: jest.fn(async () => true),
    typeOrg: jest.fn(async () => ORG),
    batchType: jest.fn(async () => TYPE),
    send: jest.fn(async () => ({ txHash: TX, confirmed: true })),
    report: jest.fn(async () => ({ ok: true as const, data: { status: 'done' as const } })),
    nowMs: () => Date.now(),
    orgs: ORGS,
    ...over,
  };
}

describe('describeSteps', () => {
  it('describeSteps names every step kind in German from the steps alone', () => {
    const steps: RegisterStep[] = [
      { fn: 'createType', orgId: ORG, localId: b32(5), kind: 'role', policy: 'issuerBatch', config: cfg },
      { fn: 'updateType', typeId: TYPE, config: cfg },
      { fn: 'retireType', typeId: TYPE },
      { fn: 'setDelegate', typeId: TYPE, delegate: DELEGATE, allowed: true },
      { fn: 'setDelegate', typeId: TYPE, delegate: DELEGATE, allowed: false },
      { fn: 'setOrgPrivateOnly', orgId: ORG, privateOnly: true },
      { fn: 'setOrgPrivateOnly', orgId: ORG, privateOnly: false },
      { fn: 'addBatch', typeId: TYPE, root: b32(1), count: 70 },
      { fn: 'addBatch', typeId: BADGE, root: b32(2), count: 3 },
      { fn: 'revokeLeaves', batchId: '4', leaves: [b32(1), b32(2)] },
      { fn: 'revokeBatch', batchId: '4' },
      { fn: 'retireType', typeId: b32(999) },
    ];
    const lines = describeSteps(steps, names, kinds, (a) => (a === DELEGATE.toLowerCase() ? 'Anna' : null));
    expect(lines).toEqual([
      'Ausweis-Typ anlegen: Vorstand',
      'Ausweis-Typ ändern: Feuerwehr',
      'Ausweis-Typ dauerhaft stilllegen: Feuerwehr',
      'Ein Konto zum Ausstellen berechtigen: Anna für Feuerwehr',
      'Berechtigung zum Ausstellen entziehen: Anna für Feuerwehr',
      'Mitglieder nur noch privat zulassen',
      'Mitglieder dürfen öffentlich sichtbar sein',
      '70 Ausweise ausstellen: Feuerwehr',
      '3 Abzeichen vergeben: Helfer:in',
      '2 Ausweise widerrufen',
      'Eine ganze Ausstellung widerrufen',
      'Ausweis-Typ dauerhaft stilllegen: Unbekannter Typ',
    ]);
    for (const l of lines) expect(l).not.toMatch(HEX_ADDRESS);
  });

  it('an unnamed delegate is "ein Konto ohne Namen", never the address', () => {
    const [line] = describeSteps([{ fn: 'setDelegate', typeId: TYPE, delegate: DELEGATE, allowed: true }], names);
    expect(line).toBe('Ein Konto zum Ausstellen berechtigen: ein Konto ohne Namen für Feuerwehr');
    expect(line).not.toMatch(HEX_ADDRESS);
  });

  it('a single item is singular', () => {
    expect(describeSteps([{ fn: 'addBatch', typeId: TYPE, root: b32(1), count: 1 }], names, kinds)).toEqual(['1 Ausweis ausstellen: Feuerwehr']);
    expect(describeSteps([{ fn: 'revokeLeaves', batchId: '1', leaves: [b32(1)] }], names)).toEqual(['1 Ausweis widerrufen']);
  });
});

describe('checkSummary', () => {
  it('checkSummary rejects 70 announced and 71 in the steps', () => {
    const steps: RegisterStep[] = [{ fn: 'addBatch', typeId: TYPE, root: b32(1), count: 71 }];
    const r = checkSummary(steps, { title: '70 Ausweise ausstellen', lines: [], orgName: null, counts: { app: 60, link: 10 } });
    expect(r.ok).toBe(false);
  });

  it('accepts matching counts and sums several batches', () => {
    const steps: RegisterStep[] = [
      { fn: 'addBatch', typeId: TYPE, root: b32(1), count: 40 },
      { fn: 'addBatch', typeId: TYPE, root: b32(2), count: 30 },
    ];
    expect(checkSummary(steps, { title: '', lines: [], orgName: null, counts: { app: 60, link: 10 } })).toEqual({ ok: true });
  });

  it('refuses a batch whose summary announces no counts, and counts without a batch', () => {
    const batch: RegisterStep[] = [{ fn: 'addBatch', typeId: TYPE, root: b32(1), count: 3 }];
    expect(checkSummary(batch, { title: '', lines: [], orgName: null }).ok).toBe(false);
    expect(checkSummary([{ fn: 'retireType', typeId: TYPE }], { title: '', lines: [], orgName: null, counts: { app: 1, link: 0 } }).ok).toBe(false);
    expect(checkSummary([{ fn: 'retireType', typeId: TYPE }], { title: '', lines: [], orgName: null })).toEqual({ ok: true });
  });
});

describe('confirmAction', () => {
  it('confirmAction encodes against the app registry address (never one the action carries)', async () => {
    const d = deps();
    const a = action();
    const r = await confirmAction(account, a, d);
    expect(r.ok).toBe(true);
    expect(d.send).toHaveBeenCalledWith(account, encodeSteps(a.steps, REG));
  });

  it('confirmAction refuses an action that carries another registry address and never sends', async () => {
    const d = deps();
    const r = await confirmAction(account, action({ registry: OTHER_REG }), d);
    expect(r.ok).toBe(false);
    expect(d.send).not.toHaveBeenCalled();
    if (!r.ok) expect(r.message).not.toMatch(HEX_ADDRESS);
  });

  it('confirmAction refuses unknown step kinds without sending', async () => {
    const d = deps();
    const r = await confirmAction(account, action({ steps: [{ fn: 'transferOwnership', to: ADDR } as any] }), d);
    expect(r.ok).toBe(false);
    expect(d.send).not.toHaveBeenCalled();
    expect(d.report).not.toHaveBeenCalled();
  });

  it('confirmAction refuses when the summary numbers do not match the steps', async () => {
    const d = deps();
    const r = await confirmAction(
      account,
      action({ steps: [{ fn: 'addBatch', typeId: TYPE, root: b32(1), count: 71 }], summary: { title: '70', lines: [], orgName: null, counts: { app: 70, link: 0 } } }),
      d,
    );
    expect(r.ok).toBe(false);
    expect(d.send).not.toHaveBeenCalled();
  });

  it('confirmAction stops with the role-sync message when the caller has no chain authority', async () => {
    const d = deps({ canIssue: jest.fn(async () => false) });
    const r = await confirmAction(account, action(), d);
    expect(r).toEqual({
      ok: false,
      message:
        'Dein Konto ist für diese Organisation noch nicht im Register berechtigt. Gleiche zuerst die Rollen ab: Organisation → Einstellungen → Onchain-Organisation.',
    });
    expect(d.send).not.toHaveBeenCalled();
  });

  it('checks the org authority for type changes and the issuing right for revocations', async () => {
    const d = deps({ canManage: jest.fn(async () => false) });
    const r = await confirmAction(
      account,
      action({ steps: [{ fn: 'setDelegate', typeId: TYPE, delegate: DELEGATE, allowed: true }], summary: { title: '', lines: [], orgName: null } }),
      d,
    );
    expect(r.ok).toBe(false);
    expect(d.typeOrg).toHaveBeenCalledWith(TYPE);
    expect(d.canManage).toHaveBeenCalledWith(ORG, ADDR);
    expect(d.send).not.toHaveBeenCalled();

    const d2 = deps();
    await confirmAction(account, action({ steps: [{ fn: 'revokeBatch', batchId: '4' }], summary: { title: '', lines: [], orgName: null } }), d2);
    expect(d2.batchType).toHaveBeenCalledWith(4n);
    expect(d2.canIssue).toHaveBeenCalledWith(TYPE, ADDR);
    expect(d2.send).toHaveBeenCalled();
  });

  it('a failed chain read never sends and never says "not authorised"', async () => {
    const d = deps({ canIssue: jest.fn(async () => Promise.reject(new Error('timeout at 0x' + 'ab'.repeat(20)))) });
    const r = await confirmAction(account, action(), d);
    expect(r.ok).toBe(false);
    expect(d.send).not.toHaveBeenCalled();
    if (!r.ok) {
      expect(r.message).not.toMatch(/berechtigt/);
      expect(r.message).not.toMatch(HEX_ADDRESS);
    }
  });

  it('confirmAction reports the transaction hash after sending', async () => {
    const d = deps();
    const a = action();
    const r = await confirmAction(account, a, d);
    expect(r).toEqual({ ok: true, status: 'done' });
    expect(d.report).toHaveBeenCalledWith(account, a.id, TX);
  });

  it('a rejected signature leaves the action untouched and returns a message without an address', async () => {
    const d = deps({ send: jest.fn(async () => Promise.reject(Object.assign(new Error('User rejected the request from 0x' + 'ab'.repeat(20)), { code: 4001 }))) });
    const r = await confirmAction(account, action(), d);
    expect(r.ok).toBe(false);
    expect(d.report).not.toHaveBeenCalled();
    if (!r.ok) {
      expect(r.message).not.toMatch(HEX_ADDRESS);
      expect(r.sent).toBeUndefined();
    }
  });

  it('a failed report after sending keeps the hash so the screen can report again instead of sending twice', async () => {
    const d = deps({ report: jest.fn(async () => ({ ok: false as const, code: 'NETWORK_ERROR', message: 'x' })) });
    const r = await confirmAction(account, action(), d);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.sent).toEqual({ txHash: TX });
    expect(d.send).toHaveBeenCalledTimes(1);
  });

  it('refuses an expired or no longer pending action without sending', async () => {
    const d = deps();
    expect((await confirmAction(account, action({ status: 'cancelled' }), d)).ok).toBe(false);
    expect((await confirmAction(account, action({ expiresAt: new Date(Date.now() - 1000).toISOString() }), d)).ok).toBe(false);
    expect(d.send).not.toHaveBeenCalled();
  });
});

describe('submittedMessage', () => {
  it('has German copy for every server error of action_submitted', () => {
    for (const code of ['TX_MISMATCH', 'TX_IN_USE', 'TX_CONFLICT', 'RECHECK_NEEDED', 'ACTION_EXPIRED', 'ACTION_NOT_PENDING']) {
      const m = submittedMessage({ code, message: 'leak 0x' + 'ab'.repeat(20) });
      expect(m.length).toBeGreaterThan(10);
      expect(m).not.toMatch(HEX_ADDRESS);
    }
    expect(submittedMessage({ code: 'TX_MISMATCH', message: '' })).not.toEqual(submittedMessage({ code: 'TX_IN_USE', message: '' }));
  });
});

describe('germanDateToIso', () => {
  it('turns TT.MM.JJJJ into the server date and refuses impossible dates', () => {
    expect(germanDateToIso('31.12.2027')).toBe('2027-12-31');
    expect(germanDateToIso('1.2.2027')).toBe('2027-02-01');
    expect(germanDateToIso('')).toBe('');
    expect(germanDateToIso('31.02.2027')).toBeNull();
    expect(germanDateToIso('2027-12-31')).toBeNull();
  });
});

describe('currentDelegates', () => {
  it('keeps the accounts whose last event allows them, in chain order', () => {
    const A = '0x' + 'aa'.repeat(20);
    const B = '0x' + 'bb'.repeat(20);
    const r = currentDelegates([
      { delegate: B, allowed: false, blockNumber: 12n, logIndex: 0 },
      { delegate: A, allowed: true, blockNumber: 10n, logIndex: 1 },
      { delegate: B, allowed: true, blockNumber: 10n, logIndex: 2 },
      { delegate: A.toUpperCase().replace('0X', '0x'), allowed: true, blockNumber: 13n, logIndex: 0 },
    ]);
    expect(r).toEqual([A]);
  });
});

describe('reviewAction', () => {
  const t = typeNamesFrom([{ typeId: TYPE, name: 'Feuerwehr', kind: 'membership' }]);
  it('shows the phone\'s own lines and lets a matching action through', () => {
    const r = reviewAction(action(), t);
    expect(r).toEqual({ lines: ['2 Ausweise ausstellen: Feuerwehr'], counts: { app: 1, link: 1 }, problem: null, hasBatch: true });
  });
  it('names a problem for another registry, mismatched counts and unknown steps', () => {
    expect(reviewAction(action({ registry: OTHER_REG }), t).problem).not.toBeNull();
    expect(reviewAction(action({ summary: { title: '', lines: [], orgName: null, counts: { app: 5, link: 0 } } }), t).problem).not.toBeNull();
    const unknown = reviewAction(action({ steps: [{ fn: 'nope' } as any] }), t);
    expect(unknown.problem).not.toBeNull();
    expect(unknown.lines).toEqual([]);
  });
});

describe('confirmAction: one org of the caller', () => {
  const delegateAction = (delegate = DELEGATE) =>
    action({ steps: [{ fn: 'setDelegate', typeId: TYPE, delegate, allowed: true }], summary: { title: '', lines: [], orgName: null } });

  it('refuses steps that belong to an org the caller does not manage', async () => {
    const d = deps({ typeOrg: jest.fn(async () => OTHER_ORG) });
    const r = await confirmAction(account, action(), d);
    expect(r.ok).toBe(false);
    expect(d.send).not.toHaveBeenCalled();
  });

  it('refuses steps spanning two orgs, even when both are the caller\'s', async () => {
    const d = deps({ orgs: [...ORGS, { accountId: OTHER_UUID, name: 'Verein' }] });
    const r = await confirmAction(
      account,
      action({
        steps: [
          { fn: 'setOrgPrivateOnly', orgId: ORG, privateOnly: true },
          { fn: 'setOrgPrivateOnly', orgId: OTHER_ORG, privateOnly: false },
        ],
        summary: { title: '', lines: [], orgName: null },
      }),
      d,
    );
    expect(r.ok).toBe(false);
    expect(d.send).not.toHaveBeenCalled();
  });

  it('refuses without the caller\'s org list', async () => {
    const d = deps({ orgs: undefined });
    expect((await confirmAction(account, action(), d)).ok).toBe(false);
    expect(d.send).not.toHaveBeenCalled();
  });

  it('resolveActionOrg follows a batch to its type and the type to its org, and names the phone\'s org', async () => {
    const typeOrg = jest.fn(async () => ORG);
    const batchType = jest.fn(async () => TYPE);
    const r = await resolveActionOrg([{ fn: 'revokeBatch', batchId: '9' }], ORGS, { typeOrg, batchType });
    expect(batchType).toHaveBeenCalledWith(9n);
    expect(typeOrg).toHaveBeenCalledWith(TYPE);
    expect(r).toEqual({ ok: true, orgId: ORG.toLowerCase(), org: ORGS[0] });
    const unknown = await resolveActionOrg([{ fn: 'revokeBatch', batchId: '9' }], ORGS, { typeOrg, batchType: async () => null });
    expect(unknown.ok).toBe(false);
  });

  it('an action started in the app for one account refuses a step naming another', async () => {
    const d = deps({ expectedDelegate: ('0x' + 'ef'.repeat(20)).toUpperCase().replace('0X', '0x') });
    const r = await confirmAction(account, delegateAction(), d);
    expect(r.ok).toBe(false);
    expect(d.send).not.toHaveBeenCalled();
    const ok = await confirmAction(account, delegateAction(), deps({ expectedDelegate: DELEGATE.toUpperCase().replace('0X', '0x') }));
    expect(ok.ok).toBe(true);
    expect(reviewAction(delegateAction(), typeNamesFrom([]), Date.now(), { expectedDelegate: '0x' + 'ef'.repeat(20) }).problem).not.toBeNull();
  });
});

describe('confirmAction: sent but unconfirmed', () => {
  it('a receipt wait that failed after sending still reports the hash and never sends twice', async () => {
    const d = deps({ send: jest.fn(async () => ({ txHash: TX, confirmed: false })) });
    const r = await confirmAction(account, action(), d);
    expect(r).toEqual({ ok: true, status: 'done' });
    expect(d.report).toHaveBeenCalledWith(account, expect.any(String), TX);
    expect(d.send).toHaveBeenCalledTimes(1);
  });

  it('a generic error mentioning "cancel" is not a user rejection', async () => {
    const d = deps({ send: jest.fn(async () => Promise.reject(new Error('operation cancelled by bundler'))) });
    const r = await confirmAction(account, action(), d);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).not.toMatch(/Abgebrochen/);
  });
});

describe('safeServerText', () => {
  it('drops a title that carries an address', () => {
    expect(safeServerText('Feuerwehr', 'x')).toBe('Feuerwehr');
    expect(safeServerText('An 0x' + 'ab'.repeat(20), 'Eine Aktion')).toBe('Eine Aktion');
  });
});
