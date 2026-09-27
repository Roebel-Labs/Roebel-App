jest.mock('react-native-passkey', () => ({ Passkey: { create: jest.fn(), get: jest.fn(), isSupported: () => true } }));

import { getAddress, hashMessage, hexToBytes, type Address, type Hex } from 'viem';
import { base64UrlEncode } from '@/lib/passkey/encoding';
import { SAFE_WEBAUTHN_SHARED_SIGNER } from '@/lib/passkey/constants';
import { safeMessageHash } from '@/lib/passkey/guardians';
import { predictSafeAddress } from '@/lib/passkey/safe-address';
import { decodeOnBehalfSignature, signHashAsIdentity, type AdapterDeps } from '@/lib/passkey/thirdweb-adapter';
import {
  PASSKEY_LINK_PREFIX,
  XMTP_PASSKEY_CHAIN_ID,
  XmtpPasskeyLinkNeededError,
  inboxHasIdentity,
  isSafeLinked,
  makeSafeScwSigner,
  planXmtpForPasskey,
  readPasskeyLinkMarker,
} from '../passkey-link';
import rv from '@/lib/passkey/__tests__/recovery-vector.json';
import sv from '@/lib/passkey/__tests__/passkey-safe-vector.json';

const LEGACY = getAddress('0xc49dE63CcfeE46C6C5c3E393293f66779799Fb28');
const x = sv.x as Hex;
const y = sv.y as Hex;
const SAFE = predictSafeAddress({ x, y });

class FakeIdentity {
  constructor(public identifier: string, public kind: string) {}
}
const sdk = { PublicIdentity: FakeIdentity as any };

function memStorage() {
  const m = new Map<string, string>();
  return { m, getItem: async (k: string) => m.get(k) ?? null, setItem: async (k: string, v: string) => void m.set(k, v) };
}

describe('Safe as an XMTP SCW signer', () => {
  it('identifies as the Safe on Gnosis, SCW, no block number', async () => {
    const s = makeSafeScwSigner(sdk, SAFE, async () => '0x' as Hex);
    expect(await s.getIdentifier()).toEqual(new FakeIdentity(SAFE, 'ETHEREUM'));
    expect(s.getChainId()).toBe(XMTP_PASSKEY_CHAIN_ID);
    expect(s.getChainId()).toBe(100);
    expect(s.signerType()).toBe('SCW');
    expect(s.getBlockNumber()).toBeUndefined();
  });

  it("signs hashMessage(text) with the Safe's OWN 1271 signature (never the legacy envelope), even for a legacy session", async () => {
    const challenges: Hex[] = [];
    const deps: AdapterDeps = {
      sign: jest.fn(async (_c: string, challenge: Hex) => {
        challenges.push(challenge);
        const a = rv.guardianApproval as any;
        const clientDataJSON = `{"type":"webauthn.get","challenge":"${base64UrlEncode(hexToBytes(challenge))}","origin":"https://id.ortis.app"}`;
        return { authenticatorData: a.authenticatorData, clientDataJSON, r: BigInt(a.r), s: BigInt(a.s) };
      }),
      isSafeDeployed: jest.fn(async () => true),
      sendUserOp: jest.fn(),
    };
    const session = { credentialId: 'c', x, y, safe: SAFE, identity: LEGACY, ownerType: 'sharedSigner' as const, owner: SAFE_WEBAUTHN_SHARED_SIGNER };
    // derived-keys-runtime.signHashAsSafe = signHashAsIdentity({ ...session, identity: session.safe })
    const signer = makeSafeScwSigner(sdk, SAFE, (h) => signHashAsIdentity({ ...session, identity: session.safe }, h, deps));
    const text = 'XMTP : Authenticate to inbox\n\nInbox ID: abc';
    const { signature } = await signer.signMessage(text);
    expect(challenges[0]).toBe(safeMessageHash(SAFE, hashMessage(text)));
    expect(decodeOnBehalfSignature(signature as Hex)).toBeNull();
  });
});

describe('planXmtpForPasskey', () => {
  it('thirdweb session → unchanged flow', () => expect(planXmtpForPasskey(null, false)).toEqual({ kind: 'thirdweb' }));
  it('Safe identity → signs as itself', () => expect(planXmtpForPasskey({ safe: SAFE, identity: SAFE }, false)).toEqual({ kind: 'safeIdentity' }));
  it('legacy identity, not linked → DMs off', () => expect(planXmtpForPasskey({ safe: SAFE, identity: LEGACY }, false)).toEqual({ kind: 'linkNeeded' }));
  it('legacy identity, linked → via Safe', () => expect(planXmtpForPasskey({ safe: SAFE, identity: LEGACY }, true)).toEqual({ kind: 'legacyViaSafe' }));
  it('the link-needed error carries the German hint with the action', () => {
    expect(new XmtpPasskeyLinkNeededError().message).toMatch(/Nachrichten auf Passkey übertragen/);
  });
});

describe('link detection', () => {
  it('inboxHasIdentity compares addresses case-insensitively and ignores non-addresses', () => {
    expect(inboxHasIdentity([{ identifier: LEGACY.toLowerCase() }, { identifier: SAFE.toLowerCase() }], SAFE)).toBe(true);
    expect(inboxHasIdentity([{ identifier: LEGACY }, { identifier: 'passkey-blob' }], SAFE)).toBe(false);
  });

  it('device marker wins without a network lookup', async () => {
    const st = memStorage();
    st.m.set(`${PASSKEY_LINK_PREFIX}${LEGACY.toLowerCase()}`, SAFE.toLowerCase());
    const inboxIdOf = jest.fn();
    await expect(isSafeLinked({ legacy: LEGACY, safe: SAFE, storage: st, inboxIdOf })).resolves.toBe(true);
    expect(inboxIdOf).not.toHaveBeenCalled();
  });

  it('a marker for a DIFFERENT Safe does not count', async () => {
    const st = memStorage();
    st.m.set(`${PASSKEY_LINK_PREFIX}${LEGACY.toLowerCase()}`, LEGACY.toLowerCase());
    expect(await readPasskeyLinkMarker(st, LEGACY, SAFE)).toBe(false);
  });

  it('network: same inbox id for legacy and Safe = linked (and remembered); different = not', async () => {
    const st = memStorage();
    await expect(
      isSafeLinked({ legacy: LEGACY, safe: SAFE, storage: st, inboxIdOf: async (a: Address) => (a === SAFE ? 'other' : 'inbox-1') }),
    ).resolves.toBe(false);
    await expect(isSafeLinked({ legacy: LEGACY, safe: SAFE, storage: st, inboxIdOf: async () => 'inbox-1' })).resolves.toBe(true);
    expect(await readPasskeyLinkMarker(st, LEGACY, SAFE)).toBe(true);
  });

  it('a failed lookup (null) is never "linked"', async () => {
    const st = memStorage();
    await expect(isSafeLinked({ legacy: LEGACY, safe: SAFE, storage: st, inboxIdOf: async () => null })).resolves.toBe(false);
  });
});
