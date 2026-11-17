import { PASSKEY_SESSION_PROP } from '../active';
import { checkWayBack, fastestWayBack, hasWayBack, readWayBack, WAY_BACK_REASON, type WayBackDeps, type WayBackRuntime } from '../way-back';

jest.mock('../way-back-runtime', () => {
  throw new Error('a provider login must never load the way-back runtime');
});

const SAFE = '0x1111111111111111111111111111111111111111';
const LEGACY = '0x2222222222222222222222222222222222222222';
const PERSON = '0x3333333333333333333333333333333333333333';
const WORD0 = '0x4444444444444444444444444444444444444440';
const POOL = {
  addresses: [0, 1, 2, 3, 4].map((i) => `0x444444444444444444444444444444444444444${i}`) as `0x${string}`[],
  confirmedAt: 1,
};

const accountOf = (identity: string) => ({
  [PASSKEY_SESSION_PROP]: { credentialId: 'c', safe: SAFE, identity },
});
const passkeyAccount = accountOf(SAFE);
const deps = (guardians: string[], pool: typeof POOL | null = null): WayBackDeps => ({
  readState: async () => ({ guardians: guardians as `0x${string}`[], threshold: 1 }),
  loadPool: async () => pool,
});

describe('hasWayBack', () => {
  it('provider logins are exempt', () => expect(hasWayBack('provider', { people: 0, wordsOn: false })).toBe(true));
  it('a passkey account needs one person or the words', () => {
    expect(hasWayBack('passkey', { people: 0, wordsOn: false })).toBe(false);
    expect(hasWayBack('passkey', { people: 1, wordsOn: false })).toBe(true);
    expect(hasWayBack('passkey', { people: 0, wordsOn: true })).toBe(true);
  });
  it('an expert account needs confirmed words, an exported file or one person', () => {
    expect(hasWayBack('words', { people: 0, wordsOn: false })).toBe(false);
    expect(hasWayBack('words', { people: 0, wordsOn: false, phraseConfirmed: true })).toBe(true);
    expect(hasWayBack('words', { people: 0, wordsOn: false, backupFileExported: true })).toBe(true);
    expect(hasWayBack('words', { people: 1, wordsOn: false })).toBe(true);
    expect(hasWayBack('words', { people: 0, wordsOn: true })).toBe(false);
  });
});

describe('fastestWayBack', () => {
  it('follows the words surface', () => {
    expect(fastestWayBack('passkey', true).route).toBe('/settings/recovery-words');
    expect(fastestWayBack('passkey', false).route).toBe('/settings/passkey');
    expect(fastestWayBack('passkey', false).label).toBe('Vertrauensperson hinzufügen');
  });
  it('an expert account is pointed at people', () => {
    expect(fastestWayBack('words', true).route).toBe('/settings/passkey');
  });
});

describe('readWayBack', () => {
  it('a thirdweb account (no passkey session) is a provider login and reads nothing', async () => {
    const r = await readWayBack({}, { readState: async () => { throw new Error('no read'); }, loadPool: async () => null });
    expect(r).toEqual({ kind: 'provider', ok: true });
  });
  it('a passkey session on a legacy identity counts as provider', async () => {
    expect(await readWayBack(accountOf(LEGACY), deps([]))).toEqual({ kind: 'provider', ok: true });
  });
  it('a passkey account without guardians has no way back', async () => {
    expect(await readWayBack(passkeyAccount, deps([]))).toEqual({ kind: 'passkey', ok: false });
  });
  it('one person is a way back', async () => {
    expect(await readWayBack(passkeyAccount, deps([PERSON]))).toEqual({ kind: 'passkey', ok: true });
  });
  it('word addresses alone are a way back (the words entry, not a person)', async () => {
    expect(await readWayBack(passkeyAccount, deps([WORD0], POOL))).toEqual({ kind: 'passkey', ok: true });
  });
  it('a failed chain read is "unknown", never "ok"', async () => {
    const r = await readWayBack(passkeyAccount, { readState: async () => { throw new Error('rpc'); }, loadPool: async () => null });
    expect(r).toEqual({ kind: 'passkey', ok: null });
  });
  it('a failed pool read does not hide a real person', async () => {
    const r = await readWayBack(passkeyAccount, { readState: async () => ({ guardians: [PERSON as `0x${string}`], threshold: 1 }), loadPool: async () => { throw new Error('store'); } });
    expect(r).toEqual({ kind: 'passkey', ok: true });
  });
});

describe('checkWayBack (I3: provider logins never load the runtime)', () => {
  const runtime = (guardians: string[], wordsOpen = true): WayBackRuntime => ({
    ...deps(guardians),
    wordsSurfaceOpen: jest.fn(async () => wordsOpen),
  });

  it('a thirdweb account: ok without loading the runtime', async () => {
    const load = jest.fn(async () => runtime([]));
    expect(await checkWayBack({ address: LEGACY }, load)).toMatchObject({ ok: true, kind: 'provider' });
    expect(load).not.toHaveBeenCalled();
  });

  it('a passkey session on a legacy identity: ok without loading the runtime', async () => {
    const load = jest.fn(async () => runtime([]));
    expect(await checkWayBack(accountOf(LEGACY), load)).toMatchObject({ ok: true, kind: 'provider' });
    expect(load).not.toHaveBeenCalled();
  });

  it('the default loader is never touched for a provider login (the runtime module throws when loaded)', async () => {
    expect(await checkWayBack(undefined)).toMatchObject({ ok: true, kind: 'provider' });
  });

  it('an independent passkey account loads the runtime: no guardians → the sheet with the fastest option', async () => {
    const rt = runtime([]);
    const r = await checkWayBack(passkeyAccount, async () => rt);
    expect(r).toEqual({ ok: false, kind: 'passkey', option: { label: 'Wiederherstellungswörter einrichten', route: '/settings/recovery-words' } });
    expect(rt.wordsSurfaceOpen).toHaveBeenCalledTimes(1);
  });

  it('one person: ok, the gate is not even asked', async () => {
    const rt = runtime([PERSON]);
    expect((await checkWayBack(passkeyAccount, async () => rt)).ok).toBe(true);
    expect(rt.wordsSurfaceOpen).not.toHaveBeenCalled();
  });

  it('a runtime that cannot load is "unknown", never "ok"', async () => {
    expect((await checkWayBack(passkeyAccount, async () => { throw new Error('native'); })).ok).toBeNull();
  });
});

describe('copy', () => {
  it('states the reason verbatim', () => {
    expect(WAY_BACK_REASON).toBe('Bevor du Bürger wirst, braucht dein Konto einen Weg zurück. Sonst wäre deine Bürgerkarte weg, wenn du dein Handy verlierst.');
  });
});
