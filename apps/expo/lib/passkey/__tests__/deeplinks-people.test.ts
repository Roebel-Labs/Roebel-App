import { getAddress, type Address } from 'viem';
import {
  buildGuardianLink,
  buildRecoverLink,
  parseAddressParam,
  parseGuardianParams,
  parseKontoCode,
  parsePasskeyUrl,
  parseRecoverParams,
  sanitizeDisplayName,
} from '../deeplinks';
import { UNKNOWN_PERSON, resolvePeople, withLabel } from '../people';

const SAFE = getAddress('0x5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a');
const SIGNER = getAddress('0x3333333333333333333333333333333333333333');
const LEGACY = getAddress('0x1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e');

describe('deep links', () => {
  it('guardian link round-trips through the URL parser and the scanner', () => {
    const url = buildGuardianLink(SAFE, 'Erna Müller');
    expect(url).toBe(`roebel://passkey/guardian?safe=${SAFE}&name=Erna%20M%C3%BCller`);
    expect(parseKontoCode(url)).toEqual({ safe: SAFE, name: 'Erna Müller' });
    expect(parseKontoCode(url.replace('roebel:', 'ortis:'))).toEqual({ safe: SAFE, name: 'Erna Müller' });
  });

  it('recover link round-trips (legacy optional)', () => {
    const url = buildRecoverLink({ wallet: SAFE, signer: SIGNER, name: 'Erna', legacy: LEGACY });
    const u = parsePasskeyUrl(url)!;
    expect(u.route).toBe('recover');
    expect(parseRecoverParams(u.params)).toEqual({ wallet: SAFE, signer: SIGNER, name: 'Erna', legacy: LEGACY });
    const noLegacy = parsePasskeyUrl(buildRecoverLink({ wallet: SAFE, signer: SIGNER, name: 'Erna' }))!;
    expect(parseRecoverParams(noLegacy.params)?.legacy).toBeNull();
  });

  it('rejects malformed addresses, the zero address and wallet == signer', () => {
    expect(parseAddressParam('0x123')).toBeNull();
    expect(parseAddressParam('0x0000000000000000000000000000000000000000')).toBeNull();
    expect(parseAddressParam(['0x5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a'])).toBe(SAFE);
    expect(parseAddressParam(' 0x5A5A5A5A5A5A5A5A5A5A5A5A5A5A5A5A5A5A5A5A ')).toBe(SAFE);
    expect(parseGuardianParams({ safe: 'nope' })).toBeNull();
    expect(parseRecoverParams({ wallet: SAFE, signer: SAFE, name: 'x' })).toBeNull();
    expect(parseRecoverParams({ wallet: SAFE, name: 'x' })).toBeNull();
    expect(parseRecoverParams({ wallet: SAFE, signer: SIGNER, legacy: 'garbage' })).toBeNull();
  });

  it('the name is display-only: sanitized, capped, optional', () => {
    expect(sanitizeDisplayName('  Erna‮\u0000  M. ')).toBe('Erna M.');
    expect(sanitizeDisplayName('x'.repeat(100))).toHaveLength(60);
    expect(sanitizeDisplayName('   ')).toBeNull();
    expect(parseGuardianParams({ safe: SAFE })).toEqual({ safe: SAFE, name: null });
  });

  it('foreign URLs are not passkey links', () => {
    expect(parsePasskeyUrl('https://evil.example/passkey/guardian?safe=' + SAFE)).toBeNull();
    expect(parsePasskeyUrl('roebel://verification/request/1')).toBeNull();
    expect(parseKontoCode(buildRecoverLink({ wallet: SAFE, signer: SIGNER }))).toBeNull();
  });
});

describe('resolvePeople', () => {
  const rows = [{ wallet_address: LEGACY.toLowerCase(), username: 'erna', display_name: 'Erna Müller', profile_picture_url: null }];

  it('profile first, then local label, then linked legacy, else "Unbekannte Person"', async () => {
    const FAMILY = getAddress('0x0000000000000000000000000000000000000f01');
    const NOBODY = getAddress('0x0000000000000000000000000000000000000f02');
    const fetchProfiles = jest.fn(async (w: string[]) => rows.filter((r) => w.includes(r.wallet_address)));
    const people = await resolvePeople([LEGACY, SAFE, FAMILY, NOBODY], {
      fetchProfiles,
      labels: withLabel({}, FAMILY, 'Tochter Anna'),
      findLinkedLegacies: async (a: Address) => (a === SAFE ? [LEGACY] : []),
    });
    expect(people.get(LEGACY.toLowerCase())).toMatchObject({ name: 'Erna Müller', known: true });
    expect(people.get(SAFE.toLowerCase())).toMatchObject({ name: 'Erna Müller', known: true, profileWallet: LEGACY });
    expect(people.get(FAMILY.toLowerCase())).toMatchObject({ name: 'Tochter Anna', known: true });
    expect(people.get(NOBODY.toLowerCase())).toMatchObject({ name: UNKNOWN_PERSON, known: false });
    for (const p of people.values()) expect(p.name).not.toMatch(/0x/);
  });

  it('a failing profile fetch degrades to labels / unknown, never throws', async () => {
    const people = await resolvePeople([SAFE], { fetchProfiles: async () => Promise.reject(new Error('x')), labels: {} });
    expect(people.get(SAFE.toLowerCase())?.name).toBe(UNKNOWN_PERSON);
  });
});
