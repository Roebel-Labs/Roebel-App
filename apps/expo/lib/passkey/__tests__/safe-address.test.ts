import { buildSafeSetup, predictSafeAddress, safeInitCode } from '../safe-address';
import { WEBAUTHN_VERIFIERS } from '../constants';
import vector from './passkey-safe-vector.json';

const key = { x: vector.x as `0x${string}`, y: vector.y as `0x${string}` };

describe('counterfactual passkey Safe', () => {
  it('packs the verifiers exactly like the fork proof', () => {
    expect(`0x${WEBAUTHN_VERIFIERS.toString(16).padStart(44, '0')}`).toBe(vector.verifiers);
  });

  it('builds the Safe.setup initializer byte-for-byte', () => {
    const { initializer, saltNonce } = buildSafeSetup(key);
    expect(initializer).toBe(vector.setupData);
    expect(saltNonce).toBe(BigInt(vector.saltNonce));
  });

  it('predicts the golden Safe address', () => {
    expect(predictSafeAddress(key)).toBe(vector.safeAddress);
  });

  it('builds the v0.7 initCode (factory ++ createProxyWithNonce calldata)', () => {
    expect(safeInitCode(key)).toBe(vector.initCode);
  });
});
