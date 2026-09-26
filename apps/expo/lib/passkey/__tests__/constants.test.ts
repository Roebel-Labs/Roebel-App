import { keccak256, stringToHex } from 'viem';
import { PASSKEY_ORIGIN, PASSKEY_PRF_SALT, PASSKEY_RP_ID } from '../constants';
import vector from './passkey-safe-vector.json';

describe('passkey relying party', () => {
  it('passkeys belong to the neutral Ortis identity domain id.ortis.app', () => {
    expect(PASSKEY_RP_ID).toBe('id.ortis.app');
    expect(PASSKEY_ORIGIN).toBe('https://id.ortis.app');
  });

  it('PRF salt = keccak256("id.ortis.app/passkey-prf/v1")', () => {
    expect(PASSKEY_PRF_SALT).toBe(keccak256(stringToHex('id.ortis.app/passkey-prf/v1')));
  });

  it('matches the rpId the forge fixture was signed for', () => {
    expect((vector as { rpId: string }).rpId).toBe(PASSKEY_RP_ID);
  });
});
