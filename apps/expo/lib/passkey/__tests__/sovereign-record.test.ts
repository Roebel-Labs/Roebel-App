import { getAddress, type Hex } from 'viem';
import { SAFE_WEBAUTHN_SHARED_SIGNER } from '../constants';
import { MIGRATION_STORE_KEY } from '../migration';
import type { PasskeySession } from '../session';
import { ensureSovereignRecord, recordFromSession } from '../sovereign-record';

const SAFE = getAddress('0xe3d18fecdcf8e8b656b11340790f7c0147632deb');
const SESSION: PasskeySession = {
  credentialId: 'cred',
  x: `0x${'11'.repeat(32)}` as Hex,
  y: `0x${'22'.repeat(32)}` as Hex,
  safe: SAFE,
  identity: SAFE,
  ownerType: 'sharedSigner',
  owner: SAFE_WEBAUTHN_SHARED_SIGNER,
};

function store(initial: Record<string, string> = {}, opts: { failRead?: boolean } = {}) {
  const m = new Map(Object.entries(initial));
  return {
    m,
    setItem: jest.fn(async (k: string, v: string) => void m.set(k, v)),
    getItem: jest.fn(async (k: string) => {
      if (opts.failRead) throw new Error('keychain locked');
      return m.get(k) ?? null;
    }),
  };
}

describe('ensureSovereignRecord', () => {
  it('a transient read error writes NOTHING and asks for a retry', async () => {
    const existing = JSON.stringify({ ...recordFromSession(SESSION), status: 'done', legacy: '0x9999999999999999999999999999999999999999' });
    const s = store({ [MIGRATION_STORE_KEY]: existing }, { failRead: true });
    expect(await ensureSovereignRecord(s, SESSION)).toEqual({ status: 'error' });
    expect(s.setItem).not.toHaveBeenCalled();
    expect(s.m.get(MIGRATION_STORE_KEY)).toBe(existing);
  });
  it('an existing record is returned untouched', async () => {
    const existing = { ...recordFromSession(SESSION), status: 'done' as const };
    const s = store({ [MIGRATION_STORE_KEY]: JSON.stringify(existing) });
    const r = await ensureSovereignRecord(s, SESSION);
    expect(r).toMatchObject({ status: 'ok', record: { status: 'done', safe: SAFE } });
    expect(s.setItem).not.toHaveBeenCalled();
  });
  it('a successful read with no record writes a fresh one from the session', async () => {
    const s = store();
    const r = await ensureSovereignRecord(s, SESSION);
    expect(r).toEqual({ status: 'ok', record: recordFromSession(SESSION) });
    expect(s.setItem).toHaveBeenCalledWith(MIGRATION_STORE_KEY, JSON.stringify(recordFromSession(SESSION)));
  });
  it('no record and no session -> none, nothing written', async () => {
    const s = store();
    expect(await ensureSovereignRecord(s, null)).toEqual({ status: 'none' });
    expect(s.setItem).not.toHaveBeenCalled();
  });
});
