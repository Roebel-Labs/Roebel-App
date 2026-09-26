/**
 * TEST-ONLY offline stand-in for a passkey Safe's `isValidSignature(bytes32, bytes)` on Gnosis
 * (Safe 1.4.1 + Safe4337Module v0.3.0 / CompatibilityFallbackHandler + SafeWebAuthnSharedSigner):
 *
 *   challenge = EIP-712 SafeMessage(bytes message = abi.encode(hash)), domain (chainId 100, safe)
 *   signature = bytes32(owner) ++ bytes32(65) ++ 0x00 ++ uint256(len) ++
 *               abi.encode(bytes authenticatorData, string clientDataFields, uint256 r, uint256 s)
 *   clientDataJSON = {"type":"webauthn.get","challenge":"<b64url(challenge)>",<fields>}
 *   P-256 verify(sha256(authenticatorData ++ sha256(clientDataJSON)), r, s) against the Safe's key
 *
 * It is checked against the fork-proven bytes in recovery-vector.json (copied from
 * contracts/passkey-accounts/test/fixtures), so a signature it accepts is one the chain accepts.
 */
import { createHash, createPrivateKey, createPublicKey, sign as nodeSign, verify as nodeVerify } from "node:crypto";
import {
  concatHex,
  decodeAbiParameters,
  encodeAbiParameters,
  encodePacked,
  hashTypedData,
  hexToBigInt,
  isAddressEqual,
  numberToHex,
  size,
  sliceHex,
  toHex,
  type Address,
  type Hex,
} from "viem";

export const SHARED_SIGNER: Address = "0x94a4F6affBd8975951142c3999aEAB7ecee555c2";
const P256_N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;

export function safeMessageHash(safe: Address, hash: Hex): Hex {
  return hashTypedData({
    domain: { chainId: 100, verifyingContract: safe },
    types: { SafeMessage: [{ name: "message", type: "bytes" }] },
    primaryType: "SafeMessage",
    message: { message: encodeAbiParameters([{ type: "bytes32" }], [hash]) },
  });
}

const b64u = (h: Hex) => Buffer.from(h.slice(2), "hex").toString("base64url");
const sha256 = (h: Hex): Hex => `0x${createHash("sha256").update(Buffer.from(h.slice(2), "hex")).digest("hex")}`;

function clientDataJSON(challenge: Hex, fields: string): string {
  return `{"type":"webauthn.get","challenge":"${b64u(challenge)}",${fields}}`;
}

function webAuthnMessage(authenticatorData: Hex, cdj: string): Hex {
  return concatHex([authenticatorData, sha256(toHex(cdj))]);
}

/** isValidSignature(hash, signature) of a deployed passkey Safe owned by `SHARED_SIGNER` bound to (x, y). */
export function emulateSafeIsValidSignature(p: { safe: Address; x: Hex; y: Hex; hash: Hex; signature: Hex }): boolean {
  try {
    const owner = `0x${p.signature.slice(2 + 24, 2 + 64)}` as Address;
    if (!isAddressEqual(owner, SHARED_SIGNER)) return false;
    if (hexToBigInt(sliceHex(p.signature, 32, 64)) !== 65n) return false;
    if (sliceHex(p.signature, 64, 65) !== "0x00") return false;
    const len = Number(hexToBigInt(sliceHex(p.signature, 65, 97)));
    const data = sliceHex(p.signature, 97, 97 + len);
    const [authenticatorData, fields, r, s] = decodeAbiParameters(
      [{ type: "bytes" }, { type: "string" }, { type: "uint256" }, { type: "uint256" }],
      data,
    );
    const challenge = safeMessageHash(p.safe, p.hash);
    const msg = webAuthnMessage(authenticatorData, clientDataJSON(challenge, fields));
    const pub = createPublicKey({ key: { kty: "EC", crv: "P-256", x: b64u(p.x), y: b64u(p.y) }, format: "jwk" });
    const sig = Buffer.from(concatHex([numberToHex(r, { size: 32 }), numberToHex(s, { size: 32 })]).slice(2), "hex");
    return nodeVerify("sha256", Buffer.from(msg.slice(2), "hex"), { key: pub, dsaEncoding: "ieee-p1363" }, sig);
  } catch {
    return false;
  }
}

/** Signs `hash` for the Safe the way the Expo app does (WebAuthn assertion over the SafeMessage hash). */
export function signAsPasskeySafe(p: {
  safe: Address;
  privateKey: Hex;
  x: Hex;
  y: Hex;
  hash: Hex;
  authenticatorData: Hex;
  fields?: string;
}): Hex {
  const fields = p.fields ?? '"origin":"https://id.ortis.app"';
  const challenge = safeMessageHash(p.safe, p.hash);
  const msg = webAuthnMessage(p.authenticatorData, clientDataJSON(challenge, fields));
  const key = createPrivateKey({
    key: { kty: "EC", crv: "P-256", x: b64u(p.x), y: b64u(p.y), d: b64u(numberToHex(hexToBigInt(p.privateKey), { size: 32 })) },
    format: "jwk",
  });
  const raw = nodeSign("sha256", Buffer.from(msg.slice(2), "hex"), { key, dsaEncoding: "ieee-p1363" });
  const r = BigInt(`0x${raw.subarray(0, 32).toString("hex")}`);
  let s = BigInt(`0x${raw.subarray(32).toString("hex")}`);
  if (s > P256_N / 2n) s = P256_N - s;
  const webAuthnSig = encodeAbiParameters(
    [{ type: "bytes" }, { type: "string" }, { type: "uint256" }, { type: "uint256" }],
    [p.authenticatorData, fields, r, s],
  );
  return encodePacked(
    ["uint256", "uint256", "uint8", "uint256", "bytes"],
    [BigInt(SHARED_SIGNER), 65n, 0, BigInt(size(webAuthnSig)), webAuthnSig],
  );
}
