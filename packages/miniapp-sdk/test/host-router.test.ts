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
  assert.deepEqual(posted[0], { netizen: 1, id: '7', result: { ok: true } });
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
