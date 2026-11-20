/**
 * ONE rule for "did this account sign this?" on the server, shared verbatim by
 * the web app (apps/web/src/lib/auth/account-signature-core.ts) and the
 * Supabase edge functions (apps/expo/supabase/functions/_shared/verify-account-signature.ts).
 * The two files must stay byte-identical (a web test enforces it). This file
 * imports nothing: the caller injects a viem public client on Gnosis and three
 * viem utils, so it runs unchanged in Node and Deno.
 *
 * verifyAccountSignature({ address, message | typedData | hash, signature }) is
 * true when ONE of:
 *
 *  (a) viem universal verification passes for `address` on Gnosis
 *      (client.verifyHash: EOA recovery, ERC-1271, ERC-6492 counterfactual).
 *      For a non-envelope signature this is EXACTLY the call the verifiers made
 *      before (client.verifyMessage == verifyHash(hashMessage(message))), so every
 *      signature that passed before still passes.
 *
 *  (b) SAFE-ADMIN ENVELOPE: the signature is
 *        SAFE_ADMIN_SIGNATURE_MAGIC (32 bytes) ++ abi.encode(address safe, bytes safeSignature)
 *      and `safeSignature` is a valid ERC-1271 (or ERC-6492) signature of `safe`
 *      over the same hash (checked with client.verifyHash on `safe`), and either
 *      safe == address (a passkey-only user whose identity is the Safe) or
 *      ILegacyAccount(address).isAdmin(safe) on Gnosis (a migrated user whose
 *      identity is the legacy thirdweb account, operated by the passkey Safe).
 *      No legitimate EOA / ERC-1271 / ERC-6492 signature starts with the magic,
 *      so an envelope is only ever checked by (b).
 *
 *  (c) thirdweb signing-domain fallback: a 65-byte signature (or the inner
 *      signature of an ERC-6492 wrapper) recovers, under the thirdweb Account
 *      EIP-712 domain ("Account", "1", chainId, address) with AccountMessage
 *      { message: hash }, for chainId 100 OR 8453, to a signer for which
 *      ILegacyAccount(address).isAdmin(signer) holds on Gnosis. The app signed with
 *      the Base chainId until 2026-07-27 (thirdweb stamps the wallet's chain, not
 *      the account's); authorisation is still decided by isAdmin on Gnosis, the
 *      chain id only picks the digest. Same rule as nostr-identity-register and
 *      packages/relay-sync.
 *
 * Errors: a transport failure of client.verifyHash or the isAdmin read THROWS
 * (callers keep their own 503 / 400 mapping). A revert or "no contract" on
 * isAdmin is `false`. A malformed envelope is `false`.
 *
 * What the Safe signs (Expo): the same bytes32 the verifier checks, i.e.
 * hashMessage(message) for EIP-191 text or hashTypedData(typedData) for EIP-712,
 * through the Safe's own ERC-1271 recipe (WebAuthn challenge = the Safe's
 * EIP-712 SafeMessage hash of abi.encode(hash), chainId 100). See
 * docs/PASSKEY_SIGNIN_NOTES.md.
 */

export type Hex = `0x${string}`;

/** keccak256("roebel.safe-admin-signature.v1") */
export const SAFE_ADMIN_SIGNATURE_MAGIC: Hex = "0xc147971c4ed41e39ec9a286f1686117a7a3e33a2a5a6bcd0ec1881c11ac60de5";

/** ERC-6492 magic suffix (32 bytes of 0x6492). */
export const ERC6492_MAGIC_SUFFIX: Hex = "0x6492649264926492649264926492649264926492649264926492649264926492";

/** Chain ids thirdweb has stamped into the Account EIP-712 domain for Röbel accounts. */
export const THIRDWEB_SIGNING_CHAIN_IDS: readonly number[] = [100, 8453];

/** The viem public client (Gnosis) surface this module needs. */
export interface AccountSignatureClient {
  /**
   * viem >= 2.22. The edge functions pin viem 2.21.x via esm.sh, whose public client has no
   * verifyHash; there verifyMessage / verifyTypedData (same universal EOA / ERC-1271 / ERC-6492
   * check over the same digest) are used instead. See verifyAt below.
   */
  verifyHash?(args: { address: Hex; hash: Hex; signature: Hex }): Promise<boolean>;
  verifyMessage?(args: { address: Hex; message: string | { raw: Hex | Uint8Array }; signature: Hex }): Promise<boolean>;
  verifyTypedData?(args: any): Promise<boolean>;
  readContract(args: {
    address: Hex;
    abi: readonly unknown[];
    functionName: string;
    args: readonly unknown[];
  }): Promise<unknown>;
}

/** viem utils this module needs (injected so the file has no imports). */
export interface AccountSignatureUtils {
  hashMessage(message: string | { raw: Hex | Uint8Array }): Hex;
  hashTypedData(typedData: any): Hex;
  recoverTypedDataAddress(args: any): Promise<Hex>;
}

export type AccountSignatureInput = {
  address: string;
  signature: string;
  /** EIP-191 message (what personal_sign / signMessage signed). */
  message?: string | { raw: Hex | Uint8Array };
  /** EIP-712 typed data (what signTypedData signed). */
  typedData?: unknown;
  /** A precomputed bytes32 digest (ERC-1271 semantics). */
  hash?: string;
};

const HEX = /^0x[0-9a-fA-F]*$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

const IS_ADMIN_ABI = [
  {
    type: "function",
    name: "isAdmin",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const lower = (h: string) => h.toLowerCase();
const sameAddress = (a: string, b: string) => lower(a) === lower(b);

/** Byte length of a 0x hex string (assumes even length). */
const byteLen = (h: string) => (h.length - 2) / 2;

/** Bytes [start, end) of a 0x hex string. */
function slice(h: string, start: number, end?: number): Hex {
  return `0x${h.slice(2 + start * 2, end === undefined ? undefined : 2 + end * 2)}` as Hex;
}

function wordToBigInt(h: string, at: number): bigint | null {
  if (byteLen(h) < at + 32) return null;
  return BigInt(slice(h, at, at + 32));
}

/** A 32-byte word holding an address (12 zero bytes + 20 bytes), or null. */
function wordToAddress(h: string, at: number): Hex | null {
  if (byteLen(h) < at + 32) return null;
  const word = slice(h, at, at + 32);
  if (!/^0x0{24}[0-9a-fA-F]{40}$/.test(word)) return null;
  return `0x${word.slice(26)}` as Hex;
}

/** Reads a dynamic `bytes` whose head offset word sits at `headAt` (offsets relative to `base`). */
function readBytes(h: string, base: number, headAt: number): { value: Hex; end: number } | null {
  const offset = wordToBigInt(h, base + headAt);
  if (offset === null || offset % 32n !== 0n || offset > BigInt(byteLen(h))) return null;
  const at = base + Number(offset);
  const len = wordToBigInt(h, at);
  if (len === null || len > BigInt(byteLen(h))) return null;
  const start = at + 32;
  const end = start + Number(len);
  if (byteLen(h) < end) return null;
  const padded = start + Math.ceil(Number(len) / 32) * 32;
  if (byteLen(h) < padded || !/^0*$/.test(slice(h, end, padded).slice(2))) return null;
  return { value: slice(h, start, end), end: padded };
}

/**
 * Decodes a Safe-admin envelope: MAGIC ++ abi.encode(address safe, bytes safeSignature).
 * Strict canonical encoding (offset 0x40, zero padding, no trailing bytes). Null when not one.
 */
export function decodeSafeAdminSignature(signature: string): { safe: Hex; safeSignature: Hex } | null {
  if (!HEX.test(signature) || signature.length % 2 !== 0) return null;
  if (byteLen(signature) < 32 + 96 || lower(slice(signature, 0, 32)) !== SAFE_ADMIN_SIGNATURE_MAGIC) return null;
  const body = slice(signature, 32);
  const safe = wordToAddress(body, 0);
  if (!safe) return null;
  if (wordToBigInt(body, 32) !== 64n) return null;
  const inner = readBytes(body, 0, 32);
  if (!inner || inner.end !== byteLen(body) || byteLen(inner.value) === 0) return null;
  return { safe, safeSignature: inner.value };
}

/** Builds the envelope (the Expo side does the same; exported for tests and tooling). */
export function encodeSafeAdminSignature(safe: string, safeSignature: string): Hex {
  if (!ADDRESS.test(safe)) throw new Error("safe must be an address");
  if (!HEX.test(safeSignature) || safeSignature.length % 2 !== 0) throw new Error("safeSignature must be hex bytes");
  const len = byteLen(safeSignature);
  const padded = safeSignature.slice(2) + "0".repeat(((32 - (len % 32)) % 32) * 2);
  const word = (n: number | bigint) => BigInt(n).toString(16).padStart(64, "0");
  return `${SAFE_ADMIN_SIGNATURE_MAGIC}${safe.slice(2).toLowerCase().padStart(64, "0")}${word(64)}${word(len)}${padded}` as Hex;
}

/** Inner signature of an ERC-6492 wrapper abi.encode(address factory, bytes calldata, bytes sig) ++ MAGIC, else the input. */
export function unwrapErc6492(signature: string): Hex {
  if (!HEX.test(signature) || byteLen(signature) < 32 || !lower(signature).endsWith(ERC6492_MAGIC_SUFFIX.slice(2))) {
    return signature as Hex;
  }
  const body = slice(signature, 0, byteLen(signature) - 32);
  if (!wordToAddress(body, 0)) return signature as Hex;
  const inner = readBytes(body, 0, 64);
  return inner ? inner.value : (signature as Hex);
}

function errorNames(err: unknown): string[] {
  const names: string[] = [];
  let e: any = err;
  for (let i = 0; e && i < 10; i++) {
    if (typeof e.name === "string") names.push(e.name);
    e = e.cause;
  }
  return names;
}

/** The node answered: the call reverted or the address has no contract code. */
function isNotAnAnswerFromAContract(err: unknown): boolean {
  return errorNames(err).some((n) => n === "ContractFunctionRevertedError" || n === "ContractFunctionZeroDataError");
}

export function makeAccountSignatureVerifier(deps: { client: AccountSignatureClient; utils: AccountSignatureUtils }) {
  const { client, utils } = deps;

  async function isAdmin(account: Hex, signer: Hex): Promise<boolean> {
    try {
      const r = await client.readContract({ address: account, abi: IS_ADMIN_ABI, functionName: "isAdmin", args: [signer] });
      return r === true;
    } catch (err) {
      if (isNotAnAnswerFromAContract(err)) return false;
      throw err;
    }
  }

  function digest(input: AccountSignatureInput): Hex | null {
    const given = [input.message !== undefined, input.typedData !== undefined, input.hash !== undefined].filter(Boolean);
    if (given.length !== 1) throw new Error("verifyAccountSignature needs exactly one of message, typedData, hash");
    if (input.hash !== undefined) return /^0x[0-9a-fA-F]{64}$/.test(input.hash) ? (input.hash as Hex) : null;
    if (input.typedData !== undefined) return utils.hashTypedData(input.typedData);
    return utils.hashMessage(input.message as string | { raw: Hex | Uint8Array });
  }

  /** (c) thirdweb Account EIP-712 AccountMessage under chainId 100 or 8453, signer checked by isAdmin on Gnosis. */
  async function thirdwebDomainFallback(address: Hex, hash: Hex, signature: Hex): Promise<boolean> {
    const inner = unwrapErc6492(signature);
    if (byteLen(inner) !== 65) return false;
    const tried = new Set<string>();
    for (const chainId of THIRDWEB_SIGNING_CHAIN_IDS) {
      let signer: Hex;
      try {
        signer = await utils.recoverTypedDataAddress({
          domain: { name: "Account", version: "1", chainId, verifyingContract: address },
          types: { AccountMessage: [{ name: "message", type: "bytes" }] },
          primaryType: "AccountMessage",
          message: { message: hash },
          signature: inner,
        });
      } catch {
        continue;
      }
      if (tried.has(lower(signer))) continue;
      tried.add(lower(signer));
      if (await isAdmin(address, signer)) return true;
    }
    return false;
  }

  /** Universal check of `signature` by `addr` over the input's digest, on whatever the client offers. */
  function verifyAt(addr: Hex, hash: Hex, signature: Hex, input: AccountSignatureInput): Promise<boolean> {
    if (typeof client.verifyHash === "function") return client.verifyHash({ address: addr, hash, signature });
    if (input.message !== undefined && typeof client.verifyMessage === "function") {
      return client.verifyMessage({ address: addr, message: input.message as string | { raw: Hex | Uint8Array }, signature });
    }
    if (input.typedData !== undefined && typeof client.verifyTypedData === "function") {
      return client.verifyTypedData({ ...input.typedData, address: addr, signature });
    }
    throw new Error("verifyAccountSignature: client offers no verifyHash / verifyMessage / verifyTypedData for this input");
  }

  return async function verifyAccountSignature(input: AccountSignatureInput): Promise<boolean> {
    if (!ADDRESS.test(input.address)) return false;
    if (!HEX.test(input.signature) || input.signature.length % 2 !== 0 || input.signature.length <= 2) return false;
    // Lowercase: viem rejects a mixed-case address with a bad checksum, and callers pass user input.
    const address = lower(input.address) as Hex;
    const signature = input.signature as Hex;
    const hash = digest(input);
    if (!hash) return false;

    const envelope = decodeSafeAdminSignature(signature);
    if (envelope) {
      // (b)
      if (!sameAddress(envelope.safe, address) && !(await isAdmin(address, envelope.safe))) return false;
      return verifyAt(envelope.safe, hash, envelope.safeSignature, input);
    }
    // (a)
    if (await verifyAt(address, hash, signature, input)) return true;
    // (c)
    return thirdwebDomainFallback(address, hash, signature);
  };
}

export type VerifyAccountSignature = ReturnType<typeof makeAccountSignatureVerifier>;
