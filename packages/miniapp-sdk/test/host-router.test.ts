import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHostBridge, type HostHandlers } from '../src/host';
import type { BridgeMessage, MiniAppPermission } from '../src/types';

function setup(handlers: HostHandlers, grantedPermissions?: MiniAppPermission[]) {
  const posted: BridgeMessage[] = [];
  const bridge = createHostBridge({ handlers, post: (m) => posted.push(m), grantedPermissions });
  return { bridge, posted };
}
const tick = () => new Promise((r) => setTimeout(r, 0));
const req = (id: string, method: string, params?: unknown) => ({
  netizen: 1,
  id,
  method,
  params,
});

test('a method without its permission is answered unauthorized', async () => {
  let called = false;
  const { bridge, posted } = setup(
    { walletRequest: () => ((called = true), 'x') },
    [],
  );
  bridge.handleMessage(req('1', 'wallet.request', { method: 'eth_chainId' }));
  await tick();
  assert.equal(called, false);
  assert.equal(posted.length, 1);
  assert.deepEqual((posted[0] as { error?: { code: string } }).error?.code, 'unauthorized');
});

test('a missing handler is answered unsupported', async () => {
  const { bridge, posted } = setup({});
  bridge.handleMessage(req('1', 'roebel.pay', { to: '0x1', amount: '1' }));
  await tick();
  assert.equal((posted[0] as { error?: { code: string } }).error?.code, 'unsupported');
});

test('grantedPermissions omitted allows all', async () => {
  const { bridge, posted } = setup({ walletRequest: () => '0x64' });
  bridge.handleMessage(req('1', 'wallet.request', { method: 'eth_chainId' }));
  await tick();
  assert.deepEqual(posted[0], { netizen: 1, id: '1', result: '0x64' });
});

test('a granted permission lets the call through', async () => {
  const { bridge, posted } = setup({ walletRequest: () => '0x64' }, ['wallet']);
  bridge.handleMessage(req('1', 'wallet.request', { method: 'eth_chainId' }));
  await tick();
  assert.equal((posted[0] as { result?: unknown }).result, '0x64');
});

test('a handler that throws a BridgeError keeps its code', async () => {
  const { bridge, posted } = setup({
    pay: () => {
      throw { code: 'budget_exceeded', message: 'x' };
    },
  });
  bridge.handleMessage(req('1', 'roebel.pay', {}));
  await tick();
  assert.deepEqual((posted[0] as { error?: unknown }).error, {
    code: 'budget_exceeded',
    message: 'x',
  });
});

test('a handler that throws an Error becomes internal', async () => {
  const { bridge, posted } = setup({
    pay: () => {
      throw new Error('boom');
    },
  });
  bridge.handleMessage(req('1', 'roebel.pay', {}));
  await tick();
  assert.deepEqual((posted[0] as { error?: unknown }).error, { code: 'internal', message: 'boom' });
});

test('a message without the protocol tag is ignored', async () => {
  const { bridge, posted } = setup({});
  bridge.handleMessage({ id: '1', method: 'bridge.hello' });
  bridge.handleMessage(JSON.stringify({ netizen: 2, id: '1', method: 'bridge.hello' }));
  bridge.handleMessage('not json');
  bridge.handleMessage(null);
  await tick();
  assert.equal(posted.length, 0);
});

test('string messages (RN WebView) are parsed', async () => {
  const { bridge, posted } = setup({});
  bridge.handleMessage(JSON.stringify(req('7', 'bridge.hello')));
  await tick();
  const m = posted[0] as { netizen: number; id: string; result: { ok: boolean; methods: string[] } };
  assert.equal(m.id, '7');
  assert.equal(m.result.ok, true);
  assert.ok(Array.isArray(m.result.methods));
});

test('analytics.track gets no reply', async () => {
  const tracked: unknown[] = [];
  const { bridge, posted } = setup({ track: (p) => void tracked.push(p) });
  bridge.handleMessage(req('1', 'analytics.track', { event: 'e' }));
  await tick();
  assert.equal(posted.length, 0);
  assert.deepEqual(tracked, [{ event: 'e' }]);
});

test('an unknown method is answered unsupported', async () => {
  const { bridge, posted } = setup({});
  bridge.handleMessage(req('1', 'nope.nothing'));
  await tick();
  assert.equal((posted[0] as { error?: { code: string } }).error?.code, 'unsupported');
});

test('sendEvent posts {netizen:1,event,data}', () => {
  const { bridge, posted } = setup({});
  bridge.sendEvent('walletChanged', { a: 1 });
  assert.deepEqual(posted, [{ netizen: 1, event: 'walletChanged', data: { a: 1 } }]);
});

test('hello lists the methods this host implements', async () => {
  const { bridge, posted } = setup({
    getContext: () => ({}) as never,
    credentialsList: async () => [],
  });
  bridge.handleMessage(req('1', 'bridge.hello', { sdkVersion: '0.3.1' }));
  await tick();
  const result = (posted[0] as { result: { ok: boolean; methods: string[] } }).result;
  assert.equal(result.ok, true);
  assert.ok(result.methods.includes('context.get'));
  assert.ok(result.methods.includes('credentials.list'));
  assert.ok(result.methods.includes('bridge.hello'));
  assert.ok(result.methods.includes('auth.getToken'));
  assert.ok(!result.methods.includes('roebel.pay'));
  assert.ok(!result.methods.includes('credentials.has'));
});

test('an object reply of a hello handler gains the method list', async () => {
  const { bridge, posted } = setup({ hello: () => ({ host: 'x' }), credentialsHas: async () => true });
  bridge.handleMessage(req('1', 'bridge.hello'));
  await tick();
  const result = (posted[0] as { result: { host: string; methods: string[] } }).result;
  assert.equal(result.host, 'x');
  assert.ok(result.methods.includes('credentials.has'));
});

test('credentials.has without a handler is unsupported', async () => {
  const { bridge, posted } = setup({});
  bridge.handleMessage(req('1', 'credentials.has', { type: 'citizen' }));
  await tick();
  assert.equal((posted[0] as { error?: { code: string } }).error?.code, 'unsupported');
});

test('credentials methods need no permission and reach their handlers', async () => {
  const { bridge, posted } = setup(
    {
      credentialsList: async () => [],
      credentialsHas: async (p) => p.type === 'citizen',
      credentialsRequest: async (p) => ({ granted: p.types.slice(0, 1) }),
    },
    [],
  );
  bridge.handleMessage(req('1', 'credentials.list'));
  bridge.handleMessage(req('2', 'credentials.has', { type: 'citizen' }));
  bridge.handleMessage(req('3', 'credentials.request', { types: ['citizen', 'attester'] }));
  await tick();
  const byId = Object.fromEntries(posted.map((m) => [(m as { id: string }).id, (m as { result?: unknown }).result]));
  assert.deepEqual(byId['1'], []);
  assert.equal(byId['2'], true);
  assert.deepEqual(byId['3'], { granted: ['citizen'] });
});

test('auth.signIn passes the nonce to its handler', async () => {
  let seen: unknown;
  const { bridge, posted } = setup({
    authSignIn: (p) => ((seen = p), { token: 't' }),
  });
  bridge.handleMessage(req('1', 'auth.signIn', { nonce: 'n1' }));
  await tick();
  assert.deepEqual(seen, { nonce: 'n1' });
  assert.deepEqual((posted[0] as { result?: unknown }).result, { token: 't' });
});
