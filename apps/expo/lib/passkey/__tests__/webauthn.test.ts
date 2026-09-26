import { createSign, generateKeyPairSync } from 'crypto';
import { bytesToHex, hexToBytes, sha256, stringToBytes, type Hex } from 'viem';

const mockCreate = jest.fn();
const mockGet = jest.fn();
jest.mock('react-native-passkey', () => ({
  Passkey: { create: (...a: unknown[]) => mockCreate(...a), get: (...a: unknown[]) => mockGet(...a), isSupported: () => true },
}));

import {
  createPasskey,
  decodePrfOutput,
  PasskeyCancelledError,
  PasskeyNotSupportedError,
  signWithPasskey,
  getPrfSecret,
} from '../webauthn';
import { base64UrlEncode, lowS, parseDerSignature } from '../encoding';
import { P256_N } from '../constants';

describe('webauthn (react-native-passkey mocked)', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockGet.mockReset();
  });

  it('maps a user cancel to PasskeyCancelledError', async () => {
    mockCreate.mockRejectedValue({ error: 'UserCancelled', message: 'The user cancelled the request.' });
    await expect(createPasskey('Max')).rejects.toBeInstanceOf(PasskeyCancelledError);
  });

  it('maps NotSupported to PasskeyNotSupportedError', async () => {
    mockGet.mockRejectedValue({ error: 'NotSupported', message: 'nope' });
    await expect(signWithPasskey('cred', `0x${'11'.repeat(32)}`)).rejects.toBeInstanceOf(PasskeyNotSupportedError);
  });

  it('decodes an assertion: DER → low-s (r,s), authData hex, clientDataJSON text, PRF', async () => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const authData = Uint8Array.from([...hexToBytes(sha256(stringToBytes('id.ortis.app'))), 0x05, 0, 0, 0, 1]);
    const challenge: Hex = `0x${'ab'.repeat(32)}`;
    const clientDataJSON = `{"type":"webauthn.get","challenge":"${base64UrlEncode(hexToBytes(challenge))}","origin":"https://id.ortis.app"}`;
    const signer = createSign('sha256');
    signer.update(Buffer.concat([Buffer.from(authData), Buffer.from(hexToBytes(sha256(stringToBytes(clientDataJSON))))]));
    const der = signer.sign(privateKey); // DER
    const prf = Uint8Array.from({ length: 32 }, (_, i) => i);
    mockGet.mockResolvedValue({
      id: 'cred',
      rawId: 'cred',
      response: {
        authenticatorData: base64UrlEncode(authData),
        clientDataJSON: base64UrlEncode(stringToBytes(clientDataJSON)),
        signature: base64UrlEncode(der),
        userHandle: '',
      },
      clientExtensionResults: { prf: { results: { first: Buffer.from(prf).toString('base64') } } },
    });
    const a = await signWithPasskey('cred', challenge);
    expect(mockGet.mock.calls[0][0].challenge).toBe(base64UrlEncode(hexToBytes(challenge)));
    expect(mockGet.mock.calls[0][0].rpId).toBe('id.ortis.app');
    expect(a.authenticatorData).toBe(bytesToHex(authData));
    expect(a.clientDataJSON).toBe(clientDataJSON);
    expect(a.s <= P256_N / 2n).toBe(true);
    expect(a.prf).toBe(bytesToHex(prf));
  });

  it('getPrfSecret returns null when the authenticator has no PRF', async () => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const s = createSign('sha256');
    s.update('x');
    mockGet.mockResolvedValue({
      id: 'c',
      rawId: 'c',
      response: {
        authenticatorData: base64UrlEncode(new Uint8Array(37)),
        clientDataJSON: base64UrlEncode(stringToBytes('{}')),
        signature: base64UrlEncode(s.sign(privateKey)),
        userHandle: '',
      },
    });
    expect(await getPrfSecret('c')).toBeNull();
  });

  it('decodePrfOutput accepts base64, base64url, byte objects; rejects wrong lengths', () => {
    const b = Uint8Array.from({ length: 32 }, (_, i) => 255 - i);
    const hex = bytesToHex(b);
    expect(decodePrfOutput(Buffer.from(b).toString('base64'))).toBe(hex);
    expect(decodePrfOutput(base64UrlEncode(b))).toBe(hex);
    expect(decodePrfOutput(Object.fromEntries(Array.from(b).map((v, i) => [String(i), v])))).toBe(hex);
    expect(decodePrfOutput(new Uint8Array(16))).toBeNull();
    expect(decodePrfOutput(undefined)).toBeNull();
  });

  it('parseDerSignature normalizes high s', () => {
    const r = 5n;
    const highS = P256_N - 7n;
    const enc = (v: bigint) => {
      let h = v.toString(16);
      if (h.length % 2) h = `0${h}`;
      let bytes = Array.from(hexToBytes(`0x${h}`));
      if (bytes[0] & 0x80) bytes = [0, ...bytes];
      return [0x02, bytes.length, ...bytes];
    };
    const body = [...enc(r), ...enc(highS)];
    const der = Uint8Array.from([0x30, body.length, ...body]);
    expect(parseDerSignature(der)).toEqual({ r, s: lowS(highS) });
    expect(lowS(highS)).toBe(7n);
  });
});
