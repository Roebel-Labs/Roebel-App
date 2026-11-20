import { getAddress, type Address } from 'viem';
import { buildEcdsaSafeSetup, ecdsaSafeFactoryData, ecdsaSafeInitCode, predictEcdsaSafeAddress } from '../ecdsa-safe';
import { SAFE_PROXY_FACTORY } from '../constants';
import { predictSafeAddress } from '../safe-address';
import { validatePhrase, wordsFromSeed } from '../words';
import vector from './ecdsa-safe-vector.json';

const v = { ...vector, owner: vector.owner as Address };

describe('ECDSA-owner Safe (expert path) vs the fork vector', () => {
  it('the vector owner is address 0 of the vector phrase', () => {
    const check = validatePhrase(v.phrase);
    if (!check.ok) throw new Error('vector phrase invalid');
    expect(wordsFromSeed(check.phrase).account(0).address).toBe(getAddress(v.owner));
  });

  it('reproduces the fork vector byte for byte', () => {
    expect(buildEcdsaSafeSetup(v.owner).initializer).toBe(v.setupData);
    expect(buildEcdsaSafeSetup(v.owner).saltNonce).toBe(BigInt(v.saltNonce));
    expect(predictEcdsaSafeAddress(v.owner)).toBe(getAddress(v.safeAddress));
    expect(ecdsaSafeInitCode(v.owner)).toBe(v.initCode.toLowerCase());
    expect(ecdsaSafeInitCode(v.owner)).toBe(v.userOp.initCode.toLowerCase());
    expect(`${SAFE_PROXY_FACTORY}${ecdsaSafeFactoryData(v.owner).slice(2)}`.toLowerCase()).toBe(v.initCode.toLowerCase());
  });

  it('a lowercase owner gives the same Safe (checksummed into the setup)', () => {
    expect(predictEcdsaSafeAddress(v.owner.toLowerCase() as Address)).toBe(getAddress(v.safeAddress));
  });

  it('a different owner gives a different Safe', () => {
    expect(predictEcdsaSafeAddress('0x70997970C51812dc3A010C7d01b50e0d17dc79C8')).not.toBe(getAddress(v.safeAddress));
  });

  it('never collides with the passkey Safe derivation', () => {
    expect(predictEcdsaSafeAddress(v.owner)).not.toBe(predictSafeAddress({ x: `0x${'01'.repeat(32)}`, y: `0x${'02'.repeat(32)}` }));
  });
});
