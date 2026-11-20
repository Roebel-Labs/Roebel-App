import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mockDispatch } from '../src/mock';
import type { NetizenMockConfig } from '../src/types';
import { installFakeWindow } from './fake-window';

test('mock context has a demo citizen', async () => {
  const ctx = (await mockDispatch('context.get', undefined)) as {
    user: { isCitizen: boolean } | null;
  };
  assert.equal(ctx.user?.isCitizen, true);
});

test('mock auth.getToken is null and signIn is unsupported', async () => {
  assert.equal(await mockDispatch('auth.getToken', undefined), null);
  await assert.rejects(mockDispatch('auth.signIn', undefined), { code: 'unsupported' });
});

test('mock data.userSet then userGet round-trips', async () => {
  assert.deepEqual(await mockDispatch('data.userSet', { key: 'k', value: { n: 1 } }), { ok: true });
  assert.deepEqual(await mockDispatch('data.userGet', { key: 'k' }), {
    value: { n: 1 },
    exists: true,
  });
  assert.deepEqual(await mockDispatch('data.userGet', { key: 'missing' }), {
    value: null,
    exists: false,
  });
});

test('mock wallet.request answers reads and rejects signing', async () => {
  assert.equal(await mockDispatch('wallet.request', { method: 'eth_chainId' }), '0x64');
  assert.deepEqual(await mockDispatch('wallet.request', { method: 'eth_accounts' }), []);
  await assert.rejects(mockDispatch('wallet.request', { method: 'personal_sign' }), {
    code: 'unsupported',
  });
});

// --- credentials + token (configured through window.__NETIZEN_MOCK__) ---

const T = 'type:0x' + '11'.repeat(32);
const ORG = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const OTHER = '3f2504e0-4f89-41d3-9a0c-0305e82c3302';

function withMock<T>(cfg: NetizenMockConfig, fn: () => Promise<T>): Promise<T> {
  const fake = installFakeWindow();
  (globalThis as unknown as { window: Window }).window.__NETIZEN_MOCK__ = cfg;
  return fn().finally(() => fake.restore());
}

test('mock: has() is true for the default citizen and false for attester', async () => {
  assert.equal(await mockDispatch('credentials.has', { type: 'citizen' }), true);
  assert.equal(await mockDispatch('credentials.has', { type: 'attester' }), false);
  const list = (await mockDispatch('credentials.list', undefined)) as { type: string }[];
  assert.deepEqual(list, [{ type: 'citizen', kind: 'builtin', name: 'Bürger:in', recognised: true }]);
});

test('mock: an org pattern matches a configured credential of that org', () =>
  withMock(
    { credentials: [{ type: T, kind: 'membership', org: ORG, name: 'Mitglied', recognised: true }] },
    async () => {
      assert.equal(await mockDispatch('credentials.has', { type: 'org:' + ORG }), true);
      assert.equal(await mockDispatch('credentials.has', { type: 'org:' + OTHER }), false);
      assert.equal(await mockDispatch('credentials.has', { type: 'citizen' }), false);
      assert.deepEqual(
        await mockDispatch('credentials.request', { types: ['org:' + ORG, 'citizen', T] }),
        { granted: ['org:' + ORG, T] },
      );
    },
  ));

test('mock: getToken returns the configured token', () =>
  withMock({ token: 'tok' }, async () => {
    assert.deepEqual(await mockDispatch('auth.getToken', undefined), { token: 'tok' });
    await assert.rejects(mockDispatch('auth.signIn', undefined), { code: 'unsupported' });
  }));

test('mock: switching to another chain is refused with 4902, to 0x64 succeeds', async () => {
  assert.equal(
    await mockDispatch('wallet.request', { method: 'wallet_switchEthereumChain', params: [{ chainId: '0x64' }] }),
    null,
  );
  await assert.rejects(
    mockDispatch('wallet.request', { method: 'wallet_switchEthereumChain', params: [{ chainId: '0x1' }] }),
    { code: 'unsupported', rpcCode: 4902 },
  );
});

test('mock: capabilities announce atomic batches on Gnosis, reads need the host', async () => {
  assert.deepEqual(await mockDispatch('wallet.request', { method: 'wallet_getCapabilities' }), {
    '0x64': { atomic: { status: 'supported' } },
  });
  await assert.rejects(mockDispatch('wallet.request', { method: 'eth_call', params: [] }), (e: unknown) => {
    const x = e as { code: string; message: string };
    assert.equal(x.code, 'unsupported');
    assert.match(x.message, /braucht den Röbel-Host/);
    return true;
  });
});
