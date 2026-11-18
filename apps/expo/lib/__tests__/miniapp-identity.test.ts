/**
 * Mini-app identity (manifest version 2): consent items, grants and the user object the app sees.
 */
import { pendingConsentKeys } from '@netizen-labs/miniapp-sdk/host';
import {
  buildConsentItems,
  credentialsEqual,
  fetchIdentityState,
  grantFromChoices,
  grantWithItem,
  grantWithdrawAll,
  isGranted,
  saveIdentityGrant,
  shapeUser,
  type IdentityState,
} from '../miniapp-identity';

const mockMem = new Map<string, string>();
jest.mock('@/lib/storage/secureStorage', () => ({
  getItemAsync: async (k: string) => mockMem.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => void mockMem.set(k, v),
  deleteItemAsync: async (k: string) => void mockMem.delete(k),
}));
jest.mock('@/lib/passkey/constants', () => ({ PASSKEY_API_URL: 'https://passkey.test' }));
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async (_a: string, s: string) =>
    jest.requireActual('node:crypto').createHash('sha256').update(s).digest('hex'),
}));
jest.mock('../miniapp-api', () => ({ miniAppApiBase: () => 'https://node.test' }));

const ORG = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const ADDR = '0xC49dE63CcfeE46C6C5c3E393293f66779799Fb28';

const app = {
  manifestVersion: 2 as const,
  identity: {
    profile: true,
    address: true,
    credentials: [
      { type: 'citizen', reason: 'Nur für Bürger.' },
      { type: 'attester', reason: 'Für Bestätiger.' },
    ],
  },
};

const state: IdentityState = {
  subject: 'nz_abc',
  asked: [],
  granted: { profile: false, address: false, credentials: [] },
  credentials: [],
  types: { citizen: { name: 'Bürger' }, attester: { name: 'Bestätiger' } },
};

const me = { address: ADDR, displayName: 'Max', avatarUrl: 'https://img/max.png', isCitizen: true };

describe('consent items', () => {
  it('asks only for what is new', () => {
    const keys = pendingConsentKeys(app.identity, ['profile', 'address', 'cred:citizen']);
    expect(buildConsentItems(app, state, keys).map((i) => i.key)).toEqual(['cred:attester']);
  });

  it('uses the exact copy and the manifest reason', () => {
    const items = buildConsentItems(app, state, ['profile', 'address', 'cred:citizen']);
    expect(items[0]).toMatchObject({ title: 'Name und Bild', detail: 'Dein Anzeigename und dein Profilbild.', defaultOn: true });
    expect(items[1].title).toBe('Deine Kontoadresse');
    expect(items[2]).toMatchObject({ title: 'Bürger', detail: 'Nur für Bürger.', privateNote: false, defaultOn: true });
  });

  it('leaves out a credential type the node does not know', () => {
    const s = { ...state, types: { ...state.types, attester: null } };
    expect(buildConsentItems(app, s, ['cred:citizen', 'cred:attester']).map((i) => i.key)).toEqual(['cred:citizen']);
  });

  it('marks a privately held membership', () => {
    const a = { identity: { profile: false, address: false, credentials: [{ type: `org:${ORG}`, reason: 'Vereinsmitglieder.' }] } };
    const s = { ...state, types: { [`org:${ORG}`]: { name: 'Mitglied', orgName: 'Sportverein', private: true } } };
    const [item] = buildConsentItems(a, s, [`cred:org:${ORG}`]);
    expect(item).toMatchObject({ title: 'Mitglied · Sportverein', privateNote: true });
  });
});

describe('grantFromChoices', () => {
  it('keeps earlier grants and records declined items as asked', () => {
    const g = grantFromChoices(
      app,
      { ...state, granted: { profile: true, address: false, credentials: [] }, asked: ['profile'] },
      ['address', 'cred:citizen'],
      new Set(['cred:citizen']),
    );
    expect(g).toEqual({ profile: true, address: false, credentials: ['citizen'], asked: ['profile', 'address', 'cred:citizen'] });
  });

  it('declining everything grants nothing but records the asked keys', () => {
    const g = grantFromChoices(app, state, ['profile', 'cred:attester'], new Set());
    expect(g).toEqual({ profile: false, address: false, credentials: [], asked: ['profile', 'cred:attester'] });
  });
});

describe('withdrawal on the detail page', () => {
  const granted: IdentityState = { ...state, asked: ['profile', 'cred:citizen'], granted: { profile: true, address: false, credentials: ['citizen'] } };
  it('switches one item and keeps the rest', () => {
    expect(grantWithItem(granted, 'cred:citizen', false)).toEqual({ profile: true, address: false, credentials: [], asked: ['profile', 'cred:citizen'] });
    expect(grantWithItem(granted, 'address', true)).toEqual({ profile: true, address: true, credentials: ['citizen'], asked: ['profile', 'cred:citizen', 'address'] });
  });
  it('withdraws everything but keeps the asked keys', () => {
    expect(grantWithdrawAll(granted)).toEqual({ profile: false, address: false, credentials: [], asked: ['profile', 'cred:citizen'] });
  });
  it('reads the current grant per key', () => {
    expect(isGranted(granted, 'profile')).toBe(true);
    expect(isGranted(granted, 'cred:citizen')).toBe(true);
    expect(isGranted(granted, 'address')).toBe(false);
  });
});

describe('shapeUser', () => {
  it('version 2 without grants shows the pseudonym and no name', () => {
    expect(shapeUser({ manifestVersion: 2 }, state, me)).toEqual({ id: 'nz_abc', isCitizen: false });
  });

  it('version 2 with grants shows the address, the profile and the citizen credential', () => {
    const s: IdentityState = {
      ...state,
      granted: { profile: true, address: true, credentials: ['citizen'] },
      credentials: [{ type: 'citizen', kind: 'builtin', name: 'Bürger', recognised: true }],
    };
    expect(shapeUser({ manifestVersion: 2 }, s, me)).toEqual({ id: ADDR, displayName: 'Max', avatarUrl: 'https://img/max.png', isCitizen: true });
  });

  it('version 2 without an identity state is signed out', () => {
    expect(shapeUser({ manifestVersion: 2 }, null, me)).toBeNull();
  });

  it('version 1 is unchanged', () => {
    expect(shapeUser({ manifestVersion: 1 }, null, me)).toEqual({ id: ADDR, displayName: 'Max', avatarUrl: 'https://img/max.png', isCitizen: true });
  });
});

describe('identity requests', () => {
  const account = () => ({ address: ADDR, signMessage: jest.fn(async () => '0x' + 'ab'.repeat(65)) });

  it('identity_get posts a signed request and parses the state', async () => {
    const fetchMock = jest.fn(async (_u: string, _i: { body: string }) => ({ ok: true, status: 200, json: async () => state }));
    (global as any).fetch = fetchMock;
    expect(await fetchIdentityState(account(), 'demo')).toEqual(state);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://node.test/api/mini-apps/identity');
    expect(JSON.parse(init.body)).toMatchObject({ scope: 'roebel-miniapp-v1', action: 'identity_get', payload: { app: 'demo' } });
  });

  it('identity_set sends the grant; a failure resolves to null', async () => {
    const fetchMock = jest.fn(async (_u: string, _i: { body: string }) => ({ ok: false, status: 503, json: async () => ({ code: 'x' }) }));
    (global as any).fetch = fetchMock;
    const grant = { profile: true, address: false, credentials: [], asked: ['profile'] };
    expect(await saveIdentityGrant(account(), 'demo', grant)).toBeNull();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ action: 'identity_set', payload: { app: 'demo', grant } });
  });
});

describe('credentialsEqual', () => {
  const c = (type: string, validUntil?: number | null) => ({ type, kind: 'builtin' as const, name: type, recognised: true, validUntil });
  it('credentialsEqual sees a new, a removed and a renewed credential', () => {
    const base = [c('citizen', null), c('attester', 100)];
    expect(credentialsEqual(base, [c('attester', 100), c('citizen', null)])).toBe(true);
    expect(credentialsEqual(base, [...base, c('guest')])).toBe(false);
    expect(credentialsEqual(base, [c('citizen', null)])).toBe(false);
    expect(credentialsEqual(base, [c('citizen', null), c('attester', 200)])).toBe(false);
    expect(credentialsEqual([c('citizen')], [c('citizen', null)])).toBe(true);
  });
});
