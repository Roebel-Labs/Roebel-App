/** Test helpers: real P-256 WebAuthn-shaped assertions from node's crypto (no native passkey). */
import { createHash, generateKeyPairSync, sign as nodeSign, type KeyObject } from 'crypto';
import { bytesToHex, concatHex, hexToBytes, sha256, stringToBytes, type Hex } from 'viem';
import { base64UrlEncode, parseDerSignature } from '../encoding';
import type { PasskeyAssertion } from '../webauthn';

export type TestPasskey = { privateKey: KeyObject; x: Hex; y: Hex };

export function newTestPasskey(): TestPasskey {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string };
  const b = (s: string) => bytesToHex(Uint8Array.from(Buffer.from(s, 'base64url')));
  return { privateKey, x: b(jwk.x), y: b(jwk.y) };
}

/** authenticatorData with UP + UV flags for rpId id.ortis.app. */
export const AUTH_DATA: Hex = concatHex([sha256(stringToBytes('id.ortis.app')), '0x05', '0x00000001']);

export function assertionFor(pk: TestPasskey, challenge: Hex): PasskeyAssertion {
  const clientDataJSON = `{"type":"webauthn.get","challenge":"${base64UrlEncode(hexToBytes(challenge))}","origin":"https://id.ortis.app"}`;
  const cdHash = createHash('sha256').update(clientDataJSON, 'utf8').digest();
  const message = Buffer.concat([Buffer.from(hexToBytes(AUTH_DATA)), cdHash]);
  const der = nodeSign('sha256', message, pk.privateKey);
  const { r, s } = parseDerSignature(Uint8Array.from(der));
  return { authenticatorData: AUTH_DATA, clientDataJSON, r, s };
}

export function mem() {
  const m = new Map<string, string>();
  return {
    m,
    getItem: async (k: string) => m.get(k) ?? null,
    setItem: async (k: string, v: string) => void m.set(k, v),
    deleteItem: async (k: string) => void m.delete(k),
  };
}
