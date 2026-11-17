import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mockDispatch } from '../src/mock';

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
