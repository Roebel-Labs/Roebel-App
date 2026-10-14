jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async (_a: string, s: string) => require('node:crypto').createHash('sha256').update(s).digest('hex'),
}));
jest.mock('expo-constants', () => ({ expoConfig: { extra: { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon' } } }));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../passkey/active', () => ({ passkeySessionOf: () => null }));
jest.mock('../passkey/api-session-runtime', () => ({ signedOrSession: jest.fn(), canSignSilently: jest.fn(async () => true) }));

import { buildRelationsMessage, callRelations, loadCachedSnapshot, saveCachedSnapshot } from '../account-relations';
import { EMPTY_SNAPSHOT } from '../relations-state';

describe('account-relations client', () => {
  it('signs the roebel-relations-v1 grammar', async () => {
    const msg = await buildRelationsMessage('follow', '0xABC', 1700000000, { targets: ['a'], source: 'manual' });
    expect(msg).toMatch(/^roebel-relations-v1:follow:0xabc:1700000000:[0-9a-f]{64}$/);
  });

  it('posts to the edge function and returns the snapshot', async () => {
    const account = { address: '0xABC', signMessage: jest.fn(async () => '0x' + 'ab'.repeat(65)) };
    const fetchMock = jest.fn(async () => ({ status: 200, json: async () => ({ ok: true, data: { ...EMPTY_SNAPSHOT, muted: ['m'] } }) }));
    (global as any).fetch = fetchMock;
    const res = await callRelations(account, 'mute', { target: 'm' });
    expect(res).toEqual({ ok: true, data: { ...EMPTY_SNAPSHOT, muted: ['m'] } });
    expect((fetchMock.mock.calls[0] as any)[0]).toBe('https://x.supabase.co/functions/v1/account-relations');
  });

  it('turns a network failure into NETWORK_ERROR instead of throwing', async () => {
    (global as any).fetch = jest.fn(async () => { throw new Error('offline'); });
    const account = { address: '0xABC', signMessage: jest.fn(async () => '0x' + 'ab'.repeat(65)) };
    const res = await callRelations(account, 'list', {});
    expect(res).toMatchObject({ ok: false, code: 'NETWORK_ERROR' });
  });

  it('caches the snapshot per lowercased wallet', async () => {
    await saveCachedSnapshot('0xABC', { ...EMPTY_SNAPSHOT, muted: ['m'] });
    expect((await loadCachedSnapshot('0xabc'))?.muted).toEqual(['m']);
    expect(await loadCachedSnapshot('0xdef')).toBeNull();
  });
});
