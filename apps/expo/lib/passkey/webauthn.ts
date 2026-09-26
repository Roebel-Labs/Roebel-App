/**
 * Native passkey calls (react-native-passkey 3.3.2) for rpId id.ortis.app (the neutral Ortis identity domain).
 *
 * PRF encoding differs per platform in react-native-passkey:
 *  - iOS decodes `prf.eval.first` from the JSON of a Uint8Array ({"0":b0,"1":b1,…}) and returns
 *    results as standard base64 (Swift `Data` JSON encoding);
 *  - Android forwards the request JSON to Credential Manager, which expects WebAuthn-JSON
 *    base64url strings and returns base64url.
 * `decodePrfOutput` accepts every shape. A missing PRF result is `null` — never derive a key
 * from a missing PRF.
 */
import { Platform } from 'react-native';
import { Passkey } from 'react-native-passkey';
import { bytesToHex, hexToBytes, type Hex } from 'viem';
import { PASSKEY_PRF_SALT, PASSKEY_RP_ID, PASSKEY_RP_NAME } from './constants';
import { publicKeyFromAttestationObject } from './cose';
import { base64UrlDecode, base64UrlEncode, parseDerSignature, utf8Decode } from './encoding';
import { randomBytes } from './random';

export type PasskeyCredential = { credentialId: string; x: Hex; y: Hex; prfSupported: boolean };

export type PasskeyAssertion = {
  authenticatorData: Hex;
  clientDataJSON: string;
  r: bigint;
  s: bigint;
  prf?: Hex;
};

export class PasskeyCancelledError extends Error {
  constructor(message = 'Passkey-Vorgang abgebrochen') {
    super(message);
    this.name = 'PasskeyCancelledError';
  }
}

export class PasskeyNotSupportedError extends Error {
  constructor(message = 'Dieses Gerät unterstützt keine Passkeys') {
    super(message);
    this.name = 'PasskeyNotSupportedError';
  }
}

/** Maps react-native-passkey's `{error, message}` objects to typed errors. */
export function mapPasskeyError(e: unknown): Error {
  const code = (e as { error?: string } | null)?.error;
  if (code === 'UserCancelled' || code === 'Interrupted') return new PasskeyCancelledError();
  if (code === 'NotSupported') return new PasskeyNotSupportedError();
  if (e instanceof Error) return e;
  const msg = (e as { message?: string } | null)?.message;
  return new Error(`Passkey-Fehler${code ? ` (${code})` : ''}${msg ? `: ${msg}` : ''}`);
}

function prfInput(salt: Uint8Array): Uint8Array | string {
  // See the header comment: iOS wants the byte object, Android the base64url string.
  return Platform.OS === 'android' ? base64UrlEncode(salt) : salt;
}

/** Normalizes a PRF output (base64 / base64url string, byte array, or {"0":…} object) to 32-byte hex. */
export function decodePrfOutput(v: unknown): Hex | null {
  if (v == null) return null;
  let bytes: Uint8Array;
  if (typeof v === 'string') bytes = base64UrlDecode(v);
  else if (v instanceof Uint8Array) bytes = v;
  else if (Array.isArray(v)) bytes = Uint8Array.from(v as number[]);
  else if (typeof v === 'object') {
    const entries = Object.entries(v as Record<string, number>).sort((a, b) => Number(a[0]) - Number(b[0]));
    bytes = Uint8Array.from(entries.map(([, b]) => b));
  } else return null;
  return bytes.length === 32 ? bytesToHex(bytes) : null;
}

export async function createPasskey(userName: string): Promise<PasskeyCredential> {
  if (!Passkey.isSupported()) throw new PasskeyNotSupportedError();
  const salt = hexToBytes(PASSKEY_PRF_SALT);
  let result;
  try {
    result = await Passkey.create({
      challenge: base64UrlEncode(randomBytes(32)),
      rp: { id: PASSKEY_RP_ID, name: PASSKEY_RP_NAME },
      user: { id: base64UrlEncode(randomBytes(16)), name: userName, displayName: userName },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }], // ES256 only (Safe WebAuthn signer = P-256)
      timeout: 120_000,
      authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'required' },
      attestation: 'none',
      extensions: { prf: { eval: { first: prfInput(salt) as Uint8Array } } },
    });
  } catch (e) {
    throw mapPasskeyError(e);
  }
  const { x, y } = publicKeyFromAttestationObject(result.response.attestationObject);
  const prf = result.clientExtensionResults?.prf;
  return {
    credentialId: result.id,
    x,
    y,
    prfSupported: !!prf?.enabled || decodePrfOutput(prf?.results?.first) !== null,
  };
}

/** WebAuthn assertion over `challenge` (32-byte hash). Also evaluates the PRF when available. */
export async function signWithPasskey(credentialId: string, challenge: Hex): Promise<PasskeyAssertion> {
  if (!Passkey.isSupported()) throw new PasskeyNotSupportedError();
  let result;
  try {
    result = await Passkey.get({
      challenge: base64UrlEncode(hexToBytes(challenge)),
      rpId: PASSKEY_RP_ID,
      timeout: 120_000,
      userVerification: 'required',
      allowCredentials: [{ type: 'public-key', id: credentialId }],
      extensions: { prf: { eval: { first: prfInput(hexToBytes(PASSKEY_PRF_SALT)) as Uint8Array } } },
    });
  } catch (e) {
    throw mapPasskeyError(e);
  }
  const { r, s } = parseDerSignature(base64UrlDecode(result.response.signature));
  const prf = decodePrfOutput(result.clientExtensionResults?.prf?.results?.first);
  return {
    authenticatorData: bytesToHex(base64UrlDecode(result.response.authenticatorData)),
    clientDataJSON: utf8Decode(base64UrlDecode(result.response.clientDataJSON)),
    r,
    s,
    ...(prf ? { prf } : {}),
  };
}

/** PRF secret for the credential (one assertion with a random challenge); null when unsupported. */
export async function getPrfSecret(credentialId: string): Promise<Hex | null> {
  const { prf } = await signWithPasskey(credentialId, bytesToHex(randomBytes(32)));
  return prf ?? null;
}
