import { leafHash, recoverClaimSigner, signClaim, type Leaf } from '@netizen-labs/credential-registry';
import { privateKeyToAccount } from 'viem/accounts';
import type { Address, Hex } from 'viem';
import type { Presentation } from '../types';
import { hashMessage, hashTypedData, recoverTypedDataAddress } from 'viem';
import { makeAccountSignatureVerifier } from '../account-signature-core';
import { showMessage } from '../show-code';
import { CheckUnavailableError, verifyPresentation } from '../verify';

const REG = ('0x' + '11'.repeat(20)) as Address;
const ME = ('0x' + 'ab'.repeat(20)) as Address;
const OTHER = ('0x' + 'cd'.repeat(20)) as Address;
const tid = (n: number) => ('0x' + n.toString(16).padStart(64, '0')) as Hex;
const TYPE = tid(7);
const CLAIM_KEY = ('0x' + '42'.repeat(32)) as Hex;
const CLAIM_ADDR = privateKeyToAccount(CLAIM_KEY).address.toLowerCase() as Address;

function pres(over: Partial<Presentation> = {}): Presentation {
  return { v: 1, typeId: TYPE, account: ME, issuedAtSec: 1_000, nonce: 'abcdefgh1234', accountSignature: '0x1234', ...over };
}

function accountLeafPart(subject: Address = ME, typeId: Hex = TYPE): NonNullable<Presentation['private']> {
  return { batchId: '3', leaf: { kind: 'account', typeId, subject, validUntil: '2000000000', salt: tid(99) }, proof: [tid(1)], claimSignature: null };
}

async function claimKeyPart(account: Address = ME): Promise<NonNullable<Presentation['private']>> {
  const leaf: Leaf = { kind: 'claimKey', typeId: TYPE, subject: CLAIM_ADDR, validUntil: 0n, salt: tid(98) };
  const sig = await signClaim(CLAIM_KEY, { chainId: 100, registry: REG, batchId: 4n, leaf: leafHash(leaf), account });
  return { batchId: '4', leaf: { kind: 'claimKey', typeId: TYPE, subject: CLAIM_ADDR, validUntil: '0', salt: tid(98) }, proof: [], claimSignature: sig };
}

function deps(
  over: { holds?: boolean; status?: string; boundTo?: Address | null; type?: unknown; sigOk?: boolean; meta?: null; until?: bigint; now?: number } = {},
) {
  const reader = {
    holds: jest.fn(async () => over.holds ?? false),
    checkLeaf: jest.fn(async () => ({ status: over.status ?? 'valid', boundTo: over.boundTo ?? null })),
    getType: jest.fn(async () =>
      over.type === undefined
        ? { typeId: TYPE, kind: 'role', recognised: true, config: { metadataURI: 'https://www.roebel.app/meta/7' } }
        : over.type,
    ),
  };
  const verifySignature = jest.fn(async () => over.sigOk ?? true);
  const holding = jest.fn(async () => ({ validUntil: over.until ?? 0n }));
  const metadata = jest.fn(async () => over.meta === null ? null : ({
    name: 'Bürgermeister',
    description: '',
    image: null,
    properties: { kind: 'role', organisation: 'Stadt Röbel', recognised: true, benefits: [] },
  }));
  return {
    reader: reader as any,
    recoverClaimSigner,
    metadata: metadata as any,
    registry: REG,
    verifySignature,
    holding,
    nowSec: () => over.now ?? 1_010,
    _r: reader,
    _m: metadata,
    _v: verifySignature,
  };
}

const run = (p: Presentation, d: ReturnType<typeof deps>, extra: { signatureValid?: boolean; ageSeconds?: number } = {}) =>
  verifyPresentation({ presentation: p, signatureValid: extra.signatureValid ?? true, ageSeconds: extra.ageSeconds ?? 10 }, d);

describe('verifyPresentation', () => {
  it('public: holds true → valid; false → invalid', async () => {
    const yes = deps({ holds: true });
    expect(await run(pres(), yes)).toEqual({ result: 'valid', title: 'Bürgermeister', orgName: 'Stadt Röbel', recognised: true, validUntil: null });
    expect(yes._r.holds).toHaveBeenCalledWith(TYPE, ME);
    expect(yes._r.checkLeaf).not.toHaveBeenCalled();
    expect((await run(pres(), deps({ holds: false }))).result).toBe('invalid');
  });

  it('private account leaf: valid only when the leaf subject is the presenting account', async () => {
    const ok = await run(pres({ private: accountLeafPart() }), deps());
    expect(ok).toMatchObject({ result: 'valid', validUntil: 2_000_000_000 });
    expect((await run(pres({ private: accountLeafPart(OTHER) }), deps())).result).toBe('invalid');
  });

  it('private claim-key leaf: valid when bound to the account, or unbound with a signature recovering to the subject', async () => {
    const part = await claimKeyPart();
    expect((await run(pres({ private: { ...part, claimSignature: null } }), deps({ boundTo: ME }))).result).toBe('valid');
    expect((await run(pres({ private: part }), deps({ boundTo: null }))).result).toBe('valid');
    // unbound, signature made for another account → does not recover to the subject for ME
    const forOther = await claimKeyPart(OTHER);
    expect((await run(pres({ private: forOther }), deps({ boundTo: null }))).result).toBe('invalid');
    // unbound, no signature
    expect((await run(pres({ private: { ...part, claimSignature: null } }), deps({ boundTo: null }))).result).toBe('invalid');
  });

  it('a claim-key leaf bound to another account is invalid', async () => {
    const part = await claimKeyPart();
    expect((await run(pres({ private: part }), deps({ boundTo: OTHER }))).result).toBe('invalid');
  });

  it('checkLeaf expired → expired, revoked → revoked, inactive → invalid', async () => {
    const p = pres({ private: accountLeafPart() });
    expect(await run(p, deps({ status: 'expired' }))).toEqual({ result: 'expired', title: 'Bürgermeister', orgName: 'Stadt Röbel' });
    expect((await run(p, deps({ status: 'revoked' }))).result).toBe('revoked');
    expect((await run(p, deps({ status: 'inactive' }))).result).toBe('invalid');
    expect((await run(p, deps({ status: 'invalid' }))).result).toBe('invalid');
  });

  it('older than 300 s or a bad account signature → invalid without any chain read', async () => {
    for (const extra of [{ ageSeconds: 301 }, { signatureValid: false }]) {
      const d = deps({ holds: true });
      expect(await run(pres(), d, extra)).toEqual({ result: 'invalid', title: null, orgName: null });
      expect(d._r.holds).not.toHaveBeenCalled();
      expect(d._r.checkLeaf).not.toHaveBeenCalled();
      expect(d._r.getType).not.toHaveBeenCalled();
      expect(d._m).not.toHaveBeenCalled();
      expect(d._v).not.toHaveBeenCalled();
    }
    expect((await run(pres(), deps({ holds: true }), { ageSeconds: 300 })).result).toBe('valid');
  });

  it('a presentation whose leaf is for another type than it claims → invalid', async () => {
    const d = deps();
    expect((await run(pres({ private: accountLeafPart(ME, tid(8)) }), d)).result).toBe('invalid');
    expect(d._r.checkLeaf).not.toHaveBeenCalled();
  });

  it('title and org come from chain metadata, not from the presentation', async () => {
    const d = deps({ holds: true });
    const p = { ...pres(), title: 'Gefälscht', orgName: 'Fake e.V.' } as unknown as Presentation;
    const r = await run(p, d);
    expect(r).toMatchObject({ title: 'Bürgermeister', orgName: 'Stadt Röbel' });
    expect(d._r.getType).toHaveBeenCalledWith(TYPE);
    expect(d._m).toHaveBeenCalledWith('https://www.roebel.app/meta/7');
    // unknown type on chain → invalid
    expect((await run(pres(), deps({ holds: true, type: null }))).result).toBe('invalid');
  });

  it('a forged account signature is invalid even when the server says signatureValid', async () => {
    const d = deps({ holds: true, sigOk: false });
    expect(await run(pres(), d, { signatureValid: true })).toEqual({ result: 'invalid', title: null, orgName: null });
    expect(d._v).toHaveBeenCalledWith(ME, showMessage(pres()), '0x1234');
    expect(d._r.holds).not.toHaveBeenCalled();
  });

  it('a stale issuedAtSec is invalid by this phone\'s clock even when the server reports age 10', async () => {
    const old = deps({ holds: true, now: 1_000 + 361 });
    expect((await run(pres(), old, { ageSeconds: 10 })).result).toBe('invalid');
    expect(old._v).not.toHaveBeenCalled();
    const future = deps({ holds: true, now: 1_000 - 61 });
    expect((await run(pres(), future, { ageSeconds: 10 })).result).toBe('invalid');
    expect((await run(pres(), deps({ holds: true, now: 1_000 + 360 }), { ageSeconds: 10 })).result).toBe('valid');
  });

  it('a valid smart-account (ERC-1271) signature passes through the shared verifier', async () => {
    const p = pres({ accountSignature: ('0x' + '77'.repeat(80)) as Hex });
    const expected = hashMessage(showMessage(p));
    const client = {
      verifyHash: jest.fn(async (a: { address: string; hash: string; signature: string }) =>
        a.address.toLowerCase() === ME && a.hash === expected && a.signature === p.accountSignature,
      ),
      readContract: jest.fn(async () => false),
    };
    const verify = makeAccountSignatureVerifier({
      client,
      utils: { hashMessage, hashTypedData: hashTypedData as any, recoverTypedDataAddress: recoverTypedDataAddress as any },
    });
    const d = { ...deps({ holds: true }), verifySignature: (address: string, message: string, signature: string) => verify({ address, message, signature }) };
    expect((await run(p, d)).result).toBe('valid');
    // the same signature over another statement fails
    const other = { ...p, nonce: 'zzzzzzzz9999' };
    expect((await run(other, d)).result).toBe('invalid');
  });

  it('a signature-check RPC failure throws instead of answering', async () => {
    const d = { ...deps({ holds: true }), verifySignature: async () => { throw new Error('rpc down'); } };
    await expect(run(pres(), d)).rejects.toThrow('rpc down');
  });

  it('a valid credential without metadata throws (Nicht geprüft), it is not invalid', async () => {
    await expect(run(pres(), deps({ holds: true, meta: null }))).rejects.toBeInstanceOf(CheckUnavailableError);
    await expect(run(pres({ private: accountLeafPart() }), deps({ meta: null }))).rejects.toBeInstanceOf(CheckUnavailableError);
    // not valid anyway → still an answer
    expect((await run(pres(), deps({ holds: false, meta: null }))).result).toBe('invalid');
  });

  it('public: validUntil comes from the on-chain holding (0 = no expiry)', async () => {
    expect(await run(pres(), deps({ holds: true, until: 2_000_000_000n }))).toMatchObject({ result: 'valid', validUntil: 2_000_000_000 });
    expect(await run(pres(), deps({ holds: true, until: 0n }))).toMatchObject({ result: 'valid', validUntil: null });
  });
});
