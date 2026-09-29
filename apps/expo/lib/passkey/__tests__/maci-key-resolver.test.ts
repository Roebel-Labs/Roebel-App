/**
 * The passkey MACI key resolver (maci-key-resolver.ts). Case from the 2026-09-29 device test:
 * passkey session on legacy 0xc49d… (Safe 0xe3d1…), no local key, a backup with only `nostr`,
 * and a July registration whose key came from a BASE signature.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Hex } from 'viem';
import type { SerializedKeypair } from '@/lib/maci';
import type { LookupResult } from '@/lib/maci-signup-lookup';
import { SLOT_DEVICE_BLOB, SLOT_LABEL } from '../derived-keys';
import type { KeyBackupBlobs, KeyBackupSlot, RemoteRead } from '../key-backup';
import { completeKeyBackup } from '../key-completion';
import {
  deriveMaciSlotFromThirdweb,
  MACI_KEY_LOST_MESSAGE,
  MACI_LOOKUP_FAILED_MESSAGE,
  MaciKeyLostError,
  resolveMaciKeyForIdentity,
  THIRDWEB_OTHER_ACCOUNT_MESSAGE,
  type MaciResolverDeps,
  type MaciThirdwebSource,
} from '../maci-key-resolver';

const IDENTITY = '0xc49dE63CcfeE46C6C5c3E393293f66779799Fb28';
const PRF = `0x${'11'.repeat(32)}` as Hex;
const enc = new TextEncoder();
const dec = new TextDecoder();

const kp = (n: number): SerializedKeypair => ({
  privKey: `macisk.${n}`,
  pubKey: `macipk.${n}`,
  pubX: String(1000 + n),
  pubY: String(2000 + n),
});
const GNOSIS = kp(1);
const BASE_RAW = kp(2);
const BASE_6492 = kp(3);
const hashOf = (k: SerializedKeypair) => `hash-${k.pubX}`;

function setup(o: {
  local?: string;
  server?: KeyBackupBlobs;
  readPrf?: boolean;
  signedUp?: Record<string, bigint>; // pubX → stateIndex
  lookupError?: boolean;
  tokenRegistered?: boolean | null;
  thirdweb?: 'same' | 'other' | null;
  legacyThrows?: boolean;
  legacyHistory?: boolean;
}) {
  const server: KeyBackupBlobs = { ...(o.server ?? {}) };
  const device: Record<string, string> = {};
  const saved: string[] = [];
  const writes: KeyBackupBlobs[] = [];
  const deriveGnosis = jest.fn(async () => GNOSIS);
  const deriveLegacy = jest.fn(async () => {
    if (o.legacyThrows) throw new Error('legacy Base signer unavailable');
    return [BASE_RAW, BASE_6492];
  });
  const tw: MaciThirdwebSource = {
    address: o.thirdweb === 'other' ? '0x0000000000000000000000000000000000000001' : IDENTITY.toLowerCase(),
    deriveGnosis,
    deriveLegacy,
  };
  const thirdweb = jest.fn(async () => (o.thirdweb === null ? null : tw));
  const read = jest.fn(async (): Promise<RemoteRead> => {
    const prf = o.readPrf ? { prf: PRF } : {};
    return Object.keys(server).length ? { status: 'found', blobs: { ...server }, ...prf } : { status: 'none', ...prf };
  });
  const lookup = jest.fn(async (x: bigint): Promise<LookupResult> => {
    if (o.lookupError) return { kind: 'error', reason: 'rpc down' };
    const hit = o.signedUp?.[x.toString()];
    return hit !== undefined ? { kind: 'found', stateIndex: hit } : { kind: 'not-found' };
  });
  const isTokenRegistered = jest.fn(async () => (o.tokenRegistered === undefined ? false : o.tokenRegistered));
  let local = o.local ?? null;
  const d: MaciResolverDeps = {
    identity: IDENTITY,
    remote: {
      read,
      write: jest.fn(async (blobs: KeyBackupBlobs) => {
        writes.push(blobs);
        Object.assign(server, blobs);
        return 'stored' as const;
      }),
    },
    storage: { getItem: async (k) => device[k] ?? null, setItem: async (k, v) => void (device[k] = v) },
    getPrf: jest.fn(async () => PRF),
    wrap: async (_p, label, secret) => `w:${label}:${dec.decode(secret)}`,
    unwrap: async (_p, label, blob) => enc.encode(blob.slice(`w:${label}:`.length)),
    loadLocal: jest.fn(async () => local),
    saveLocal: jest.fn(async (raw: string) => {
      local = raw;
      saved.push(raw);
    }),
    hasLegacyHistory: jest.fn(async () => o.legacyHistory ?? true),
    generate: () => JSON.stringify(kp(9)),
    thirdweb: o.thirdweb === undefined ? jest.fn(async () => tw) : thirdweb,
    lookup,
    isTokenRegistered,
    pubKeyHashOf: hashOf,
  };
  return { d, server, device, saved, writes, deriveGnosis, deriveLegacy, lookup, isTokenRegistered, read };
}

const label = SLOT_LABEL.maci;

describe('resolveMaciKeyForIdentity — thirdweb derivation (migrated person, no key anywhere)', () => {
  it('picks the July BASE key when only it has a SignUp; persists it with its stateIndex', async () => {
    const s = setup({ server: { nostr: 'w:x:n' }, signedUp: { [BASE_RAW.pubX]: 7n }, tokenRegistered: true });
    const r = await resolveMaciKeyForIdentity(s.d);
    expect(r.status).toBe('ready');
    if (r.status !== 'ready') return;
    expect(r.source).toBe('thirdweb');
    expect(r.origin).toBe('base');
    expect(r.stateIndex).toBe(7n);
    expect(r.keypair).toEqual({ ...BASE_RAW, stateIndex: '7', pubKeyHash: hashOf(BASE_RAW) });
    expect(s.saved).toEqual([JSON.stringify(r.keypair)]);
    // ONE Gnosis signature + ONE Base signature
    expect(s.deriveGnosis).toHaveBeenCalledTimes(1);
    expect(s.deriveLegacy).toHaveBeenCalledTimes(1);
    expect(s.isTokenRegistered).not.toHaveBeenCalled(); // a SignUp decides on its own
  });

  it('picks the ERC-6492 July variant when that one is registered', async () => {
    const s = setup({ signedUp: { [BASE_6492.pubX]: 3n } });
    const r = await resolveMaciKeyForIdentity(s.d);
    expect(r.status === 'ready' && r.origin).toBe('base-6492');
  });

  it('picks the GNOSIS key when only it has a SignUp', async () => {
    const s = setup({ signedUp: { [GNOSIS.pubX]: 12n }, tokenRegistered: true });
    const r = await resolveMaciKeyForIdentity(s.d);
    expect(r.status === 'ready' && r.origin).toBe('gnosis');
    if (r.status !== 'ready') return;
    expect(r.stateIndex).toBe(12n);
    expect(r.keypair.pubX).toBe(GNOSIS.pubX);
  });

  it('no SignUp and the token is NOT registered → the Gnosis key for a fresh signup', async () => {
    const s = setup({ tokenRegistered: false });
    const r = await resolveMaciKeyForIdentity(s.d);
    expect(r.status).toBe('ready');
    if (r.status !== 'ready') return;
    expect(r.origin).toBe('gnosis');
    expect(r.stateIndex).toBeUndefined();
    expect(r.keypair).toEqual(GNOSIS);
    expect(s.saved).toEqual([JSON.stringify(GNOSIS)]);
    expect(s.writes).toEqual([{ maci: `w:${label}:${JSON.stringify(GNOSIS)}` }]);
  });

  it('no CitizenNFT at all (null) → the Gnosis key as well', async () => {
    const s = setup({ tokenRegistered: null });
    const r = await resolveMaciKeyForIdentity(s.d);
    expect(r.status === 'ready' && r.origin).toBe('gnosis');
  });

  it('token registered but no candidate has a SignUp → the lost-key message; nothing saved or backed up', async () => {
    const s = setup({ tokenRegistered: true });
    const p = resolveMaciKeyForIdentity(s.d);
    await expect(p).rejects.toBeInstanceOf(MaciKeyLostError);
    await expect(resolveMaciKeyForIdentity(setup({ tokenRegistered: true }).d)).rejects.toThrow(MACI_KEY_LOST_MESSAGE);
    expect(s.saved).toEqual([]);
    expect(s.writes).toEqual([]);
  });

  it('token registered but the July derivation failed → retryable, never "lost"', async () => {
    const s = setup({ tokenRegistered: true, legacyThrows: true });
    await expect(resolveMaciKeyForIdentity(s.d)).rejects.toThrow(MACI_LOOKUP_FAILED_MESSAGE);
    expect(s.saved).toEqual([]);
  });

  it('a failed SignUp lookup with a REGISTERED token is retryable: no key saved (never persist a guess)', async () => {
    const s = setup({ lookupError: true, tokenRegistered: true });
    await expect(resolveMaciKeyForIdentity(s.d)).rejects.toThrow(MACI_LOOKUP_FAILED_MESSAGE);
    expect(s.saved).toEqual([]);
    expect(s.writes).toEqual([]);
  });

  it('a failed SignUp lookup with an UNREGISTERED token still gives the Gnosis key (no SignUp can exist)', async () => {
    const s = setup({ lookupError: true, tokenRegistered: false });
    const r = await resolveMaciKeyForIdentity(s.d);
    expect(r.status === 'ready' && r.origin).toBe('gnosis');
  });

  it('a failed gatekeeper read is retryable too', async () => {
    const s = setup({});
    (s.d.isTokenRegistered as jest.Mock).mockRejectedValueOnce(new Error('rpc'));
    await expect(resolveMaciKeyForIdentity(s.d)).rejects.toThrow(MACI_LOOKUP_FAILED_MESSAGE);
  });

  it('writes the backup: slot maci wrapped under the PRF, device blob kept, ONE server read, ONE PRF prompt', async () => {
    const s = setup({ server: { nostr: 'w:x:n' }, signedUp: { [BASE_RAW.pubX]: 7n } });
    const r = await resolveMaciKeyForIdentity(s.d);
    if (r.status !== 'ready') throw new Error('not ready');
    const raw = JSON.stringify(r.keypair);
    expect(r.backedUp).toBe(true);
    expect(s.writes).toEqual([{ maci: `w:${label}:${raw}` }]);
    expect(s.server.maci).toBe(`w:${label}:${raw}`);
    expect(s.server.nostr).toBe('w:x:n'); // untouched
    expect(s.device[SLOT_DEVICE_BLOB.maci]).toBe(`w:${label}:${raw}`);
    expect(s.read).toHaveBeenCalledTimes(1); // memoized: the backup reuses the first read
    expect(s.d.getPrf).toHaveBeenCalledTimes(1); // the one fingerprint for wrapping
  });

  it("reuses the read's PRF output (no extra fingerprint) when the read was signed", async () => {
    const s = setup({ readPrf: true, signedUp: { [BASE_RAW.pubX]: 7n } });
    await resolveMaciKeyForIdentity(s.d);
    expect(s.d.getPrf).not.toHaveBeenCalled();
    expect(s.writes).toHaveLength(1);
  });

  it('a backup failure keeps the key on the device (voting works) and reports it', async () => {
    const s = setup({ signedUp: { [BASE_RAW.pubX]: 7n } });
    (s.d.remote!.write as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    const r = await resolveMaciKeyForIdentity(s.d);
    expect(r.status === 'ready' && r.backedUp).toBe(false);
    expect(r.status === 'ready' && r.backupError).toBe('offline');
    expect(s.saved).toHaveLength(1);
  });

  it('no thirdweb session on the device → needsThirdweb (ThirdwebConfirm); nothing derived or written', async () => {
    const s = setup({ thirdweb: null });
    expect(await resolveMaciKeyForIdentity(s.d)).toEqual({ status: 'needsThirdweb' });
    expect(s.deriveGnosis).not.toHaveBeenCalled();
    expect(s.writes).toEqual([]);
  });

  it('refuses a thirdweb session of ANOTHER account', async () => {
    const s = setup({ thirdweb: 'other', signedUp: { [GNOSIS.pubX]: 1n } });
    await expect(resolveMaciKeyForIdentity(s.d)).rejects.toThrow(THIRDWEB_OTHER_ACCOUNT_MESSAGE);
    expect(s.deriveGnosis).not.toHaveBeenCalled();
  });
});

describe('resolveMaciKeyForIdentity — existing sources win (no thirdweb, no lookup)', () => {
  it('a key on this device', async () => {
    const s = setup({ local: JSON.stringify(BASE_RAW) });
    const r = await resolveMaciKeyForIdentity(s.d);
    expect(r).toEqual({ status: 'ready', keypair: BASE_RAW, source: 'local' });
    expect(s.deriveGnosis).not.toHaveBeenCalled();
    expect(s.read).not.toHaveBeenCalled();
  });

  it('the server backup (slot maci) is unwrapped and persisted', async () => {
    const s = setup({ server: { maci: `w:${label}:${JSON.stringify(BASE_RAW)}` } });
    const r = await resolveMaciKeyForIdentity(s.d);
    expect(r.status === 'ready' && r.source).toBe('backup');
    expect(s.saved).toEqual([JSON.stringify(BASE_RAW)]);
    expect(s.deriveGnosis).not.toHaveBeenCalled();
    expect(s.lookup).not.toHaveBeenCalled();
  });

  it('a passkey-only person (no legacy history) still gets a random key, never a thirdweb derivation', async () => {
    const s = setup({ legacyHistory: false });
    const r = await resolveMaciKeyForIdentity(s.d);
    expect(r.status === 'ready' && r.source).toBe('generated');
    expect(s.deriveGnosis).not.toHaveBeenCalled();
    expect(s.deriveLegacy).not.toHaveBeenCalled();
  });
});

describe('key-completion ("Schlüssel sichern") uses the resolver for slot maci', () => {
  it('backs up the July Base key (not the Gnosis key) for a July registrant', async () => {
    const s = setup({ server: { nostr: 'w:x:n' }, signedUp: { [BASE_RAW.pubX]: 7n } });
    const src: MaciThirdwebSource = {
      address: IDENTITY,
      deriveGnosis: s.deriveGnosis,
      deriveLegacy: s.deriveLegacy,
    };
    const r = await completeKeyBackup({
      identity: IDENTITY,
      remote: s.d.remote,
      sources: (['maci', 'nostr'] as KeyBackupSlot[]).map((slot) => ({ slot, loadLocal: async () => null })),
      storage: s.d.storage,
      getPrf: s.d.getPrf,
      wrap: s.d.wrap,
      unwrap: s.d.unwrap,
      hasCommitment: async () => false,
      thirdweb: async () => ({
        address: IDENTITY,
        derive: async (slot) => {
          if (slot !== 'maci') throw new Error('unexpected slot');
          return deriveMaciSlotFromThirdweb(src, s.d);
        },
      }),
    });
    expect(r.status === 'done' && r.complete).toBe(true);
    const expected = JSON.stringify({ ...BASE_RAW, stateIndex: '7', pubKeyHash: hashOf(BASE_RAW) });
    expect(s.server.maci).toBe(`w:${label}:${expected}`);
    expect(s.saved).toEqual([expected]);
  });

  it('deriveMaciSlotFromThirdweb never overwrites a device key', async () => {
    const s = setup({ local: JSON.stringify(GNOSIS), signedUp: { [BASE_RAW.pubX]: 7n } });
    const out = await deriveMaciSlotFromThirdweb(
      { address: IDENTITY, deriveGnosis: s.deriveGnosis, deriveLegacy: s.deriveLegacy },
      s.d,
    );
    expect(dec.decode(out)).toBe(JSON.stringify(GNOSIS));
    expect(s.deriveGnosis).not.toHaveBeenCalled();
    expect(s.saved).toEqual([]);
  });

  it('the runtime wires slot maci through deriveMaciSlotFromThirdweb (no bare Gnosis derivation)', () => {
    const src = fs.readFileSync(path.join(__dirname, '../key-completion-runtime.ts'), 'utf8');
    expect(src).toMatch(/deriveMaciSlotFromThirdweb\(thirdwebMaciSource\(account\)/);
    expect(src).not.toMatch(/deriveMaciKeypairFromWalletSignature/);
  });
});

describe('never setActiveWallet, never a passkey signature', () => {
  const files = [
    '../maci-key-resolver.ts',
    '../maci-key-runtime.ts',
    '../key-completion-runtime.ts',
    '../../maci-signup-runtime.ts',
    '../../../context/MaciContext.tsx',
    '../../../components/VoteButtons.tsx',
  ];
  it.each(files)('%s has no setActiveWallet / connection-manager call', (rel) => {
    const src = fs
      .readFileSync(path.join(__dirname, rel), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(src).not.toMatch(/setActiveWallet\s*\(/);
    expect(src).not.toMatch(/useSetActiveWallet|useConnect\b/);
  });

  it('the passkey runtime derives only from the thirdweb account (thirdwebMaciSource), never the session', () => {
    const src = fs.readFileSync(path.join(__dirname, '../maci-key-runtime.ts'), 'utf8');
    expect(src).toMatch(/acc \? thirdwebMaciSource\(acc\) : null/);
    expect(src).not.toMatch(/signWithPasskey|signHashAsIdentity/);
  });
});
