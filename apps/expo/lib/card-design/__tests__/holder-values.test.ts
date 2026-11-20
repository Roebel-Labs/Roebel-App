jest.mock('@/lib/citizen-commitment', () => ({ loadCitizenPreimage: jest.fn() }));

import { holderValues } from '../holder-values';

const base = { verifiedName: null, displayName: null, validUntil: null, acceptedAt: null };

describe('holderValues', () => {
  it('prefers the verified first and last name', () => {
    expect(holderValues({ ...base, verifiedName: { first: ' Erika ', last: 'Mustermann' }, displayName: 'eri' }).holderName).toBe('Erika Mustermann');
  });
  it('falls back to the display name', () => {
    expect(holderValues({ ...base, displayName: 'Eri M.' }).holderName).toBe('Eri M.');
    // A preimage without names (enrolled citizen) is not a verified name.
    expect(holderValues({ ...base, verifiedName: { first: '', last: ' ' }, displayName: 'Eri' }).holderName).toBe('Eri');
  });
  it('omits the name when both are missing', () => {
    expect('holderName' in holderValues(base)).toBe(false);
    expect('holderName' in holderValues({ ...base, displayName: '  ' })).toBe(false);
  });
  it('formats dates German', () => {
    const v = holderValues({ ...base, validUntil: '2027-12-31T22:59:59Z', acceptedAt: '2026-03-01T10:00:00Z' });
    expect(v.validUntil).toBe('31.12.2027');
    expect(v.memberSince).toBe('01.03.2026');
  });
  it('leaves out invalid dates', () => {
    expect('validUntil' in holderValues({ ...base, validUntil: 'nope' })).toBe(false);
  });
});
