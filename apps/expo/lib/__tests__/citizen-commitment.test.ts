import {
  germanDateToIso,
  fieldFromString,
  saltFromSignature,
  computeCommitment,
} from '../citizen-commitment';
import type { CitizenPreimage } from '../verification-types';

describe('germanDateToIso', () => {
  it('converts DD.MM.YYYY to ISO', () => {
    expect(germanDateToIso('05.03.1990')).toBe('1990-03-05');
  });
  it('rejects malformed input', () => {
    expect(germanDateToIso('1990-03-05')).toBeNull();
    expect(germanDateToIso('5.3.90')).toBeNull();
    expect(germanDateToIso('32.13.1990')).toBeNull();
  });
  it('rejects impossible calendar dates', () => {
    expect(germanDateToIso('31.04.1990')).toBeNull(); // April has 30 days
    expect(germanDateToIso('29.02.2023')).toBeNull(); // 2023 is not a leap year
    expect(germanDateToIso('29.02.2024')).toBe('2024-02-29'); // 2024 is a leap year
  });
});

describe('fieldFromString', () => {
  it('is deterministic and within the field', () => {
    const a = fieldFromString('Müller');
    const b = fieldFromString('Müller');
    expect(a).toBe(b);
    expect(a > 0n).toBe(true);
  });
  it('differs for different inputs', () => {
    expect(fieldFromString('Müller')).not.toBe(fieldFromString('Mueller'));
  });
});

describe('saltFromSignature', () => {
  it('is deterministic for the same signature', () => {
    const sig = '0x' + 'ab'.repeat(65);
    expect(saltFromSignature(sig)).toBe(saltFromSignature(sig));
  });
  it('returns a decimal string', () => {
    const sig = '0x' + 'cd'.repeat(65);
    expect(saltFromSignature(sig)).toMatch(/^\d+$/);
  });
});

describe('computeCommitment', () => {
  const preimage: CitizenPreimage = {
    firstName: 'Anna',
    lastName: 'Müller',
    birthdate: '1990-03-05',
    address: 'Musterstraße 1, 17207 Röbel',
    salt: '12345678901234567890',
  };
  it('is deterministic and 0x-hex', () => {
    const c = computeCommitment(preimage);
    expect(c).toBe(computeCommitment(preimage));
    expect(c).toMatch(/^0x[0-9a-f]+$/);
  });
  it('changes when any field changes', () => {
    const base = computeCommitment(preimage);
    expect(computeCommitment({ ...preimage, firstName: 'Anne' })).not.toBe(base);
    expect(computeCommitment({ ...preimage, salt: '99' })).not.toBe(base);
  });
});
