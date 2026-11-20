jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));

import { connectionKey, readV1Choice, saveV1Choice, v1ConnectItems, v1Pseudonym, v1User } from '../miniapp-connection';

const mem = () => {
  const m = new Map<string, string>();
  return { m, getItem: async (k: string) => m.get(k) ?? null, setItem: async (k: string, v: string) => void m.set(k, v) };
};
const ADDR = '0xAbCdEf0000000000000000000000000000000001';
const profile = { displayName: 'Max', avatarUrl: 'https://x/a.png', isCitizen: true };

describe('version-1 connect choice', () => {
  it('is null until answered, then remembered per app and account (case-insensitive)', async () => {
    const kv = mem();
    expect(await readV1Choice('app1', ADDR, kv)).toBeNull();
    await saveV1Choice('app1', ADDR, { profile: true, address: false }, kv);
    expect(await readV1Choice('app1', ADDR.toLowerCase(), kv)).toEqual({ profile: true, address: false });
    expect(await readV1Choice('app2', ADDR, kv)).toBeNull();
    expect(kv.m.has(connectionKey('app1', ADDR))).toBe(true);
  });

  it('a storage error counts as never asked and saving never throws', async () => {
    const broken = { getItem: async () => { throw new Error('x'); }, setItem: async () => { throw new Error('x'); } };
    expect(await readV1Choice('a', ADDR, broken)).toBeNull();
    await expect(saveV1Choice('a', ADDR, { profile: true, address: true }, broken)).resolves.toBeUndefined();
  });

  it('offers name/picture and account, both on by default', () => {
    expect(v1ConnectItems().map((i) => [i.key, i.defaultOn])).toEqual([['profile', true], ['address', true]]);
  });
});

describe('v1User', () => {
  it('no user before the dialog was answered or when everything is off', () => {
    expect(v1User('a', ADDR, null, profile)).toBeNull();
    expect(v1User('a', ADDR, { profile: false, address: false }, profile)).toBeNull();
  });

  it('everything shared', () => {
    expect(v1User('a', ADDR, { profile: true, address: true }, profile)).toEqual({ id: ADDR, displayName: 'Max', avatarUrl: 'https://x/a.png', isCitizen: true });
  });

  it('profile without account: a per-app pseudonym instead of the address', () => {
    const u = v1User('a', ADDR, { profile: true, address: false }, profile)!;
    expect(u.id).toBe(v1Pseudonym('a', ADDR));
    expect(u.id).not.toContain(ADDR.slice(2).toLowerCase());
    expect(u.displayName).toBe('Max');
    expect(v1Pseudonym('a', ADDR)).not.toBe(v1Pseudonym('b', ADDR));
  });

  it('account without profile: no name, no picture', () => {
    expect(v1User('a', ADDR, { profile: false, address: true }, profile)).toEqual({ id: ADDR, isCitizen: true });
  });
});
