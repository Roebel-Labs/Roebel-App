import { encodeFunctionData, parseAbi } from 'viem';
import {
  KNOWN_CONTRACT_LABELS,
  buildMessageConfirm,
  buildTransactionConfirm,
  buildTypedDataConfirm,
  describeCall,
} from '../miniapp-confirm';

jest.mock('@/constants/gnosis', () => ({
  circlesHubAddress: '0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8',
  citizenNFTGnosisAddress: '0x59aA26f499D7C2B3EC2c8524Ed06F54fc4E85dE5',
  attesterNFTGnosisAddress: '0xC587F383696D3c9DF7A6eE03A9160E40Ae1cdb82',
  orgRegistryGnosisAddress: '0x320b4ea2f4E31b81245e684D08AF593DE05E9919',
}));
jest.mock('@/constants/thirdweb', () => ({ maciAddress: '0x6663eDC8650276fe264710B1A2ba46eB8bd0bF1D' }));

const TARGET = '0xAbC0000000000000000000000000000000000001';
const OTHER = '0x0000000000000000000000000000000000000002';
const PERSON = '0x3333333333333333333333333333333333333333';
const HUB = '0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8';
const CHECK_IN = encodeFunctionData({ abi: parseAbi(['function checkIn(uint256)']), functionName: 'checkIn', args: [1n] });

const app = {
  name: 'Fitness',
  manifestVersion: 2 as const,
  contracts: [{ address: TARGET.toLowerCase(), label: 'Trainingsbuch', functions: ['checkIn(uint256)'] }],
};
const v1 = { name: 'Alt', manifestVersion: 1 as const, contracts: [] };

const declared = { to: TARGET, data: CHECK_IN };
const undeclared = { to: OTHER, data: '0xdeadbeef' };
const transfer = { to: PERSON, value: '0xde0b6b3a7640000' };
const names = (a: string) => (a.toLowerCase() === PERSON.toLowerCase() ? 'Bäckerei Müller' : null);

const ADDRESS_RE = /0x[0-9a-fA-F]{6,}/;

describe('describeCall', () => {
  it('names a declared call by its label and function', () => {
    expect(describeCall(app, { to: TARGET, data: CHECK_IN }, () => null)).toEqual({
      contract: 'Trainingsbuch',
      action: 'checkIn',
      declared: true,
    });
  });

  it('an undeclared contract is unknown and never shows its address', () => {
    const v = describeCall(app, { to: OTHER, data: '0xdeadbeef' }, () => null);
    expect(v).toEqual({ contract: 'Unbekannter Vertrag', action: 'Unbekannte Funktion', declared: false });
  });

  it('a known system contract is named but not declared', () => {
    expect(describeCall(app, { to: HUB, data: '0xdeadbeef' }, () => null)).toEqual({
      contract: 'Röbel Münzen',
      action: 'Vertrags-Aufruf',
      declared: false,
    });
    expect(Object.keys(KNOWN_CONTRACT_LABELS)).toHaveLength(5);
  });

  it('a plain transfer shows the recipient by name and the amount', () => {
    expect(describeCall(app, transfer, names)).toEqual({
      contract: 'Bäckerei Müller',
      action: 'Überweisung',
      amount: '1',
      declared: false,
    });
    expect(describeCall(app, { to: OTHER, value: '0x1' }, names).contract).toBe('Unbekanntes Konto');
  });
});

describe('buildTransactionConfirm', () => {
  const seven = Array.from({ length: 7 }, () => declared);

  it('a batch lists every call and warns when one is undeclared', () => {
    const r = buildTransactionConfirm(app, [declared, declared, undeclared, ...seven], () => null);
    expect(r.title).toBe('10 Aktionen bestätigen');
    expect(r.rows.filter((x) => x.label.endsWith('Vertrag'))).toHaveLength(10);
    expect(r.rows[0].label).toBe('1. Vertrag');
    expect(r.rows.find((x) => x.label === '3. Vertrag')?.value).toBe('Unbekannter Vertrag');
    expect(r.warning).toMatch(/nicht angemeldet/);
  });

  it('a fully declared batch has no warning and says Bestätigen', () => {
    const r = buildTransactionConfirm(app, [declared, declared], () => null);
    expect(r.title).toBe('2 Aktionen bestätigen');
    expect(r.warning).toBeUndefined();
    expect(r.cta).toBe('Bestätigen');
  });

  it('one call: plain labels, the amount and Bezahlen', () => {
    const r = buildTransactionConfirm(app, [transfer], names);
    expect(r.title).toBe('Transaktion bestätigen');
    expect(r.rows).toEqual([
      { label: 'Vertrag', value: 'Bäckerei Müller' },
      { label: 'Aktion', value: 'Überweisung' },
      { label: 'Betrag', value: '1 xDAI' },
    ]);
    expect(r.cta).toBe('Bezahlen');
  });

  it('a version-1 app gets the gentler warning', () => {
    expect(buildTransactionConfirm(v1, [undeclared], () => null).warning).toBe('Prüfe genau, was du bestätigst.');
  });

  it('no row value contains a 0x address', () => {
    const fixtures = [
      buildTransactionConfirm(app, [declared, undeclared, transfer, { to: HUB, data: '0x12345678' }], names),
      buildTransactionConfirm(app, [{ to: OTHER, value: '0x5' }], () => null),
      buildTransactionConfirm(v1, [undeclared], () => null),
      buildTypedDataConfirm(app, [PERSON, JSON.stringify({ primaryType: 'Permit', domain: { name: 'Token', verifyingContract: TARGET }, message: { owner: PERSON } })], names),
      buildMessageConfirm(app, `Anmelden als ${PERSON}`, names),
    ];
    for (const r of fixtures) {
      for (const row of r.rows) expect(ADDRESS_RE.test(row.value)).toBe(false);
      if (r.raw) expect(/0x[0-9a-fA-F]{40}/.test(r.raw)).toBe(false);
      if (r.warning) expect(ADDRESS_RE.test(r.warning)).toBe(false);
    }
  });
});

describe('signing views', () => {
  it('typed data names the primary type and the declared contract', () => {
    const r = buildTypedDataConfirm(
      app,
      [PERSON, { primaryType: 'CheckIn', domain: { name: 'Fit', verifyingContract: TARGET }, message: {} }],
      () => null,
    );
    expect(r.rows).toEqual([
      { label: 'Inhalt', value: 'CheckIn' },
      { label: 'Für', value: 'Trainingsbuch' },
    ]);
  });

  it('typed data falls back to the domain name', () => {
    const r = buildTypedDataConfirm(app, [PERSON, { primaryType: 'Mail', domain: { name: 'Post' }, message: {} }], () => null);
    expect(r.rows).toEqual([
      { label: 'Inhalt', value: 'Mail' },
      { label: 'Für', value: 'Post' },
    ]);
  });

  it('a message shows the decoded text', () => {
    const hex = `0x${Buffer.from('Hallo Röbel', 'utf8').toString('hex')}`;
    expect(buildMessageConfirm(app, 'Hallo', () => null).rows).toEqual([{ label: 'Nachricht', value: 'Hallo' }]);
    expect(buildMessageConfirm(app, hex, () => null).rows[0].value).toContain('Hallo');
  });
});
